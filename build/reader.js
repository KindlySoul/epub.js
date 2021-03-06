EPUBJS.reader = {};
EPUBJS.reader.plugins = {}; //-- Attach extra Controllers as plugins (like search?)

(function(root, $) {

	var previousReader = root.ePubReader || {};

	var ePubReader = root.ePubReader = function(path, options) {
		return new EPUBJS.Reader(path, options);
	};

	_.extend(ePubReader, {
		noConflict : function() {
			root.ePubReader = previousReader;
			return this;
		}
	});

	//exports to multiple environments
	if (typeof define === 'function' && define.amd)
	//AMD
	define(function(){ return Reader; });
	else if (typeof module != "undefined" && module.exports)
	//Node
	module.exports = ePubReader;

})(window, jQuery);

EPUBJS.Reader = function(path, _options) {
	var reader = this;
	var book;
	var plugin;
	
	this.settings = _.defaults(_options || {}, {
		restore : true,
		reload : false,
		bookmarks : null,
		contained : null,
		bookKey : null,
		styles : null
	});
	
	this.setBookKey(path); //-- This could be username + path or any unique string
	
	if(this.settings.restore && this.isSaved()) {
		this.applySavedSettings();
	}

	this.settings.styles = this.settings.styles || {
		fontSize : "100%"
	};
	
	this.book = book = new EPUBJS.Book({
		bookPath: path,
		restore: this.settings.restore,
		reload: this.settings.reload,
		contained: this.settings.contained,
		bookKey: this.settings.bookKey,
		styles: this.settings.styles
	});
	
	if(this.settings.previousLocationCfi) {
		book.gotoCfi(this.settings.previousLocationCfi);
	}
	
	this.offline = false;
	this.sidebarOpen = false;
	if(!this.settings.bookmarks) {
		this.settings.bookmarks = [];
	}

	book.renderTo("viewer");
	
	reader.ReaderController = EPUBJS.reader.ReaderController.call(reader, book);
	reader.SettingsController = EPUBJS.reader.SettingsController.call(reader, book);
	reader.ControlsController = EPUBJS.reader.ControlsController.call(reader, book);
	reader.SidebarController = EPUBJS.reader.SidebarController.call(reader, book);
	reader.BookmarksController = EPUBJS.reader.BookmarksController.call(reader, book);
	
	// Call Plugins
	for(plugin in EPUBJS.reader.plugins) {
		if(EPUBJS.reader.plugins.hasOwnProperty(plugin)) {
			reader[plugin] = EPUBJS.reader.plugins[plugin].call(reader, book);
		}
	}
	
	book.ready.all.then(function() {
		reader.ReaderController.hideLoader();
	});

	book.getMetadata().then(function(meta) {
		reader.MetaController = EPUBJS.reader.MetaController.call(reader, meta);
	});

	book.getToc().then(function(toc) {
		reader.TocController = EPUBJS.reader.TocController.call(reader, toc);
	});
	
	window.addEventListener("beforeunload", this.unload.bind(this), false);
	
	document.addEventListener('keydown', this.adjustFontSize.bind(this), false);
	
	book.on("renderer:keydown", this.adjustFontSize.bind(this));
	book.on("renderer:keydown", reader.ReaderController.arrowKeys.bind(this));

	return this;
};

EPUBJS.Reader.prototype.adjustFontSize = function(e) {
	var fontSize;
	var interval = 2;
	var PLUS = 187;
	var MINUS = 189;
	var ZERO = 48;
	var MOD = (e.ctrlKey || e.metaKey );
	
	if(!this.settings.styles) return;
	
	if(!this.settings.styles.fontSize) {
		this.settings.styles.fontSize = "100%";
	}
	
	fontSize = parseInt(this.settings.styles.fontSize.slice(0, -1));

	if(MOD && e.keyCode == PLUS) {
		e.preventDefault();
		this.book.setStyle("fontSize", (fontSize + interval) + "%");
		
	}

	if(MOD && e.keyCode == MINUS){

		e.preventDefault();
		this.book.setStyle("fontSize", (fontSize - interval) + "%");
	}
	
	if(MOD && e.keyCode == ZERO){
		e.preventDefault();
		this.book.setStyle("fontSize", "100%");
	}
};

EPUBJS.Reader.prototype.addBookmark = function(cfi) {
	var present = this.isBookmarked(cfi);
	if(present > -1 ) return;

	this.settings.bookmarks.push(cfi);
	
	this.trigger("reader:bookmarked", cfi);
};

EPUBJS.Reader.prototype.removeBookmark = function(cfi) {
	var bookmark = this.isBookmarked(cfi);
	if( bookmark === -1 ) return;
	
	delete this.settings.bookmarks[bookmark];
	
	this.trigger("reader:unbookmarked", bookmark);
};

EPUBJS.Reader.prototype.isBookmarked = function(cfi) {
	var bookmarks = this.settings.bookmarks;
	
	return bookmarks.indexOf(cfi);
};

/*
EPUBJS.Reader.prototype.searchBookmarked = function(cfi) {
	var bookmarks = this.settings.bookmarks,
			len = bookmarks.length,
			i;
	
	for(i = 0; i < len; i++) {
		if (bookmarks[i]['cfi'] === cfi) return i;
	}
	return -1;
};
*/

EPUBJS.Reader.prototype.clearBookmarks = function() {
	this.settings.bookmarks = [];
};

//-- Settings
EPUBJS.Reader.prototype.setBookKey = function(identifier){
	if(!this.settings.bookKey) {
		this.settings.bookKey = "epubjsreader:" + EPUBJS.VERSION + ":" + window.location.host + ":" + identifier;
	}
	return this.settings.bookKey;
};

//-- Checks if the book setting can be retrieved from localStorage
EPUBJS.Reader.prototype.isSaved = function(bookPath) {
	var storedSettings = localStorage.getItem(this.settings.bookKey);

	if( !localStorage ||
		storedSettings === null) {
		return false;
	} else {
		return true;
	}
};

EPUBJS.Reader.prototype.removeSavedSettings = function() {
	localStorage.removeItem(this.settings.bookKey);
};

EPUBJS.Reader.prototype.applySavedSettings = function() {
		var stored = JSON.parse(localStorage.getItem(this.settings.bookKey));
		
		if(stored) {
			this.settings = _.defaults(this.settings, stored);
			return true;
		} else {
			return false;
		}
};

EPUBJS.Reader.prototype.saveSettings = function(){
	if(this.book) {
		this.settings.previousLocationCfi = this.book.getCurrentLocationCfi();
	}

	localStorage.setItem(this.settings.bookKey, JSON.stringify(this.settings));
};

EPUBJS.Reader.prototype.unload = function(){
	if(this.settings.restore) {
		this.saveSettings();
	}
};

//-- Enable binding events to reader
RSVP.EventTarget.mixin(EPUBJS.Reader.prototype);
EPUBJS.reader.BookmarksController = function() {
	var reader = this;
	var book = this.book;

	var $bookmarks = $("#bookmarksView"),
			$list = $bookmarks.find("#bookmarks");
	
	var docfrag = document.createDocumentFragment();
	
	var show = function() {
		$bookmarks.show();
	};

	var hide = function() {
		$bookmarks.hide();
	};
	
	var counter = 0;
	
	var createBookmarkItem = function(cfi) {
		var listitem = document.createElement("li"),
				link = document.createElement("a");
		
		listitem.id = "bookmark-"+counter;
		listitem.classList.add('list_item');
		
		//-- TODO: Parse Cfi
		link.textContent = cfi;
		link.href = cfi;

		link.classList.add('bookmark_link');
		
		link.addEventListener("click", function(event){
				var cfi = this.getAttribute('href');
				book.gotoCfi(cfi);
				event.preventDefault();
		}, false);
		
		listitem.appendChild(link);
		
		counter++;
		
		return listitem;
	};

	this.settings.bookmarks.forEach(function(cfi) { 
		var bookmark = createBookmarkItem(cfi);
		docfrag.appendChild(bookmark);
	});
	
	$list.append(docfrag);
	
	this.on("reader:bookmarked", function(cfi) {
		var item = createBookmarkItem(cfi);
		$list.append(item);
	});
	
	this.on("reader:unbookmarked", function(index) {
		var $item = $("#bookmark-"+index);
		$item.remove();
	});

	return {
		"show" : show,
		"hide" : hide
	};
};
EPUBJS.reader.ControlsController = function(book) {
	var reader = this;

	var $store = $("#store"),
			$fullscreen = $("#fullscreen"),
			$fullscreenicon = $("#fullscreenicon"),
			$cancelfullscreenicon = $("#cancelfullscreenicon"),
			$slider = $("#slider"),
			$main = $("#main"),
			$sidebar = $("#sidebar"),
			$settings = $("#setting"),
			$bookmark = $("#bookmark");

	var goOnline = function() {
		reader.offline = false;
		// $store.attr("src", $icon.data("save"));
	};

	var goOffline = function() {
		reader.offline = true;
		// $store.attr("src", $icon.data("saved"));
	};
	
	var fullscreen = false;

	book.on("book:online", goOnline);
	book.on("book:offline", goOffline);

	$slider.on("click", function () {
		if(reader.sidebarOpen) {
			reader.SidebarController.hide();
			$slider.addClass("icon-menu");
			$slider.removeClass("icon-right");
		} else {
			reader.SidebarController.show();
			$slider.addClass("icon-right");
			$slider.removeClass("icon-menu");
		}
	});

	$fullscreen.on("click", function() {
		screenfull.toggle($('#container')[0]);
	});
	
	document.addEventListener(screenfull.raw.fullscreenchange, function() {
			fullscreen = screenfull.isFullscreen;
			if(fullscreen) {
				$fullscreen
					.addClass("icon-resize-small")
					.removeClass("icon-resize-full");
			} else {
				$fullscreen
					.addClass("icon-resize-full")
					.removeClass("icon-resize-small");
			}
	});
	
	
	$settings.on("click", function() {
		reader.SettingsController.show();
	});

	$bookmark.on("click", function() {
		var cfi = reader.book.getCurrentLocationCfi();
		var bookmarked = reader.isBookmarked(cfi);
		
		if(bookmarked === -1) { //-- Add bookmark
			reader.addBookmark(cfi);
			$bookmark
				.addClass("icon-bookmark")
				.removeClass("icon-bookmark-empty"); 
		} else { //-- Remove Bookmark
			reader.removeBookmark(cfi);
			$bookmark
				.removeClass("icon-bookmark")
				.addClass("icon-bookmark-empty"); 
		}

	});

	book.on('renderer:pageChanged', function(cfi){
		//-- Check if bookmarked
		var bookmarked = reader.isBookmarked(cfi);
		
		if(bookmarked === -1) { //-- Not bookmarked
			$bookmark
				.removeClass("icon-bookmark")
				.addClass("icon-bookmark-empty"); 
		} else { //-- Bookmarked
			$bookmark
				.addClass("icon-bookmark")
				.removeClass("icon-bookmark-empty"); 
		}
		
	});

	return {

	};
};
EPUBJS.reader.MetaController = function(meta) {
	var title = meta.bookTitle,
			author = meta.creator;

	var $title = $("#book-title"),
			$author = $("#chapter-title"),
			$dash = $("#title-seperator");

		document.title = title+" – "+author;

		$title.html(title);
		$author.html(author);
		$dash.show();
};
EPUBJS.reader.ReaderController = function(book) {
	var $main = $("#main"),
			$divider = $("#divider"),
			$loader = $("#loader"),
			$next = $("#next"),
			$prev = $("#prev");

	var slideIn = function() {
		$main.removeClass("closed");
	};

	var slideOut = function() {
		$main.addClass("closed");
	};

	var showLoader = function() {
		$loader.show();
		hideDivider();
	};

	var hideLoader = function() {
		$loader.hide();
		
		//-- If the book is using spreads, show the divider
		if(book.settings.spreads) {
			showDivider();
		}
	};

	var showDivider = function() {
		$divider.addClass("show");
	};

	var hideDivider = function() {
		$divider.removeClass("show");
	};

	var keylock = false;

	var arrowKeys = function(e) {		
		if(e.keyCode == 37) { 
			book.prevPage();
			$prev.addClass("active");

			keylock = true;
			setTimeout(function(){
				keylock = false;
				$prev.removeClass("active");
			}, 100);

			 e.preventDefault();
		}
		if(e.keyCode == 39) { 
			book.nextPage();
			$next.addClass("active");

			keylock = true;
			setTimeout(function(){
				keylock = false;
				$next.removeClass("active");
			}, 100);

			 e.preventDefault();
		}
	}

	document.addEventListener('keydown', arrowKeys, false);

	$next.on("click", function(e){
		book.nextPage();
		e.preventDefault();
	});

	$prev.on("click", function(e){
		book.prevPage();
		e.preventDefault();
	});
	
	book.on("book:spreads", function(){
		if(book.settings.spreads) {
			showDivider();
		} else {
			hideDivider();
		}
	});

	return {
		"slideOut" : slideOut,
		"slideIn"  : slideIn,
		"showLoader" : showLoader,
		"hideLoader" : hideLoader,
		"showDivider" : showDivider,
		"hideDivider" : hideDivider,
		"arrowKeys" : arrowKeys
	};
};
EPUBJS.reader.SettingsController = function() {
	var book = this.book;

	var $settings = $("#settings-modal"),
			$overlay = $(".overlay");

	var show = function() {
		$settings.addClass("md-show");
	};

	var hide = function() {
		$settings.removeClass("md-show");
	};

	$settings.find(".closer").on("click", function() {
		hide();
	});

	$overlay.on("click", function() {
		hide();
	});

	return {
		"show" : show,
		"hide" : hide
	};
};
EPUBJS.reader.SidebarController = function(book) {
	var reader = this;

	var $sidebar = $("#sidebar"),
			$panels = $("#panels");

	var activePanel = "Toc";

	var changePanelTo = function(viewName) {
		var controllerName = viewName + "Controller";
		
		if(activePanel == viewName || typeof reader[controllerName] === 'undefined' ) return;
		reader[activePanel+ "Controller"].hide();
		reader[controllerName].show();
		activePanel = viewName;

		$panels.find('.active').removeClass("active");
		$panels.find("#show-" + viewName ).addClass("active");
	};
	
	var getActivePanel = function() {
		return activePanel;
	};
	
	var show = function() {
		reader.sidebarOpen = true;
		reader.ReaderController.slideOut();
		$sidebar.addClass("open");
	}

	var hide = function() {
		reader.sidebarOpen = false;
		reader.ReaderController.slideIn();
		$sidebar.removeClass("open");
	}

	$panels.find(".show_view").on("click", function(event) {
		var view = $(this).data("view");

		changePanelTo(view);
		event.preventDefault();
	});

	return {
		'show' : show,
		'hide' : hide,
		'getActivePanel' : getActivePanel,
		'changePanelTo' : changePanelTo
	};
};
EPUBJS.reader.TocController = function(toc) {
	var book = this.book;

	var $list = $("#tocView"),
			docfrag = document.createDocumentFragment();

	var currentChapter = false;

	var generateTocItems = function(toc, level) {
		var container = document.createElement("ul");

		if(!level) level = 1;

		toc.forEach(function(chapter) {
			var listitem = document.createElement("li"),
					link = document.createElement("a");
					toggle = document.createElement("a");

			var subitems;

			listitem.id = "toc-"+chapter.id;
			listitem.classList.add('list_item');

			link.textContent = chapter.label;
			link.href = chapter.href;
			
			link.classList.add('toc_link');

			listitem.appendChild(link);

			if(chapter.subitems.length > 0) {
				level++;
				subitems = generateTocItems(chapter.subitems, level);
				toggle.classList.add('toc_toggle');

				listitem.insertBefore(toggle, link);
				listitem.appendChild(subitems);
			}


			container.appendChild(listitem);

		});

		return container;
	};

	var onShow = function() {
		$list.show();
	};

	var onHide = function() {
		$list.hide();
	};

	var chapterChange = function(e) {
		var id = e.id,
				$item = $list.find("#toc-"+id),
				$current = $list.find(".currentChapter"),
				$open = $list.find('.openChapter');

		if($item.length){

			if($item != $current && $item.has(currentChapter).length > 0) {
				$current.removeClass("currentChapter");
			}

			$item.addClass("currentChapter");

			// $open.removeClass("openChapter");
			$item.parents('li').addClass("openChapter");
		}	  
	};

	book.on('renderer:chapterDisplayed', chapterChange);

	var tocitems = generateTocItems(toc);

	docfrag.appendChild(tocitems);

	$list.append(docfrag);
	$list.find(".toc_link").on("click", function(event){
			var url = this.getAttribute('href');

			//-- Provide the Book with the url to show
			//   The Url must be found in the books manifest
			book.goto(url);

			$list.find(".currentChapter")
					.addClass("openChapter")
					.removeClass("currentChapter");

			$(this).parent('li').addClass("currentChapter");

			event.preventDefault();
	});

	$list.find(".toc_toggle").on("click", function(event){
			var $el = $(this).parent('li'),
					open = $el.hasClass("openChapter");

			if(open){
				$el.removeClass("openChapter");
			} else {
				$el.addClass("openChapter");
			}
			event.preventDefault();
	});

	return {
		"show" : onShow,
		"hide" : onHide
	};
};
