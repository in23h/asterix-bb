var app = app || {};

// Models
app.Book = Backbone.Model.extend({
	defaults: {
        volume: "Unknown",
        title: "No title",
        year: "Unknown",
        description: "None",
        image: "img/placeholder.png",
		collected: false
    },
	
	initialize: function(){
		this.on('add', function(){
			this.save();
		});
	},
	
	toggle: function() {
		this.save({
			collected: !this.get('collected')
		});
	}
	
});



// Collections
var LibraryCollection = Backbone.Collection.extend({
	model: app.Book,

	localStorage: new Backbone.LocalStorage('asterix-collection'),
	
	collected: function() {
		return this.filter(function( book ) {
			return book.get('collected');
		});
	},

	filterById: function(ids){
		return this.models.filter(function(c){
			return _.contains(ids, c.id);
		})
	},
	
	remaining: function() {
		return this.without.apply( this, this.collected() );
	}
});

app.Library = new LibraryCollection();

// Views
// Book View - single
app.BookView = Backbone.View.extend({
	tagName: 'li',

	className: 'span3',
	
	template: _.template( $( '#album-template' ).html() ),
	
	events: {
		'mouseover': 'hoverOn',
		'mouseout': 'hoverOut',
		'click .collectionAdd': 'togglecollected',
		'click .collectionRemove': 'removeIt'
	},
	
	initialize: function() {
		this.listenTo(this.model, 'change', this.render);
		this.listenTo(this.model, 'visible', this.toggleVisible);
		this.listenTo(this.model, 'destroy', this.remove);
    },
	
	render: function() {
		this.$el.html( this.template( this.model.toJSON() ) );
		this.$el.toggleClass( 'collected', this.model.get('collected') );
		return this;
	},
	
	toggleVisible : function () {
		this.$el.toggleClass( 'hidden',  this.isHidden());
	},
	

	isHidden : function () {
		var isCollected = this.model.get('collected');
		return ( // hidden cases only
			(!isCollected && app.BookFilter === 'collected')
			|| (isCollected && app.BookFilter === 'remaining')
		);
	},
	
	hoverOn: function(){
		this.$el.find(".thumbnail-overlay").stop().animate({'opacity':1},200);
		this.$el.find(".thumbnail-overlay").css('height',this.$el.find(".thumbnail img").height());
	},
	
	hoverOut: function(){
		this.$el.find(".thumbnail-overlay").stop().animate({'opacity':0},200);
	},
	
	togglecollected: function(e) {
		e.preventDefault();
		this.model.toggle();
	},
	
	removeIt: function(e){
		e.preventDefault();
		this.model.destroy();
	}
});

// Library View - all
app.LibraryView = Backbone.View.extend({
	el: '#wrap',
	
	initialize: function( initialBooks ) {
		this.listenTo(app.Library, 'filter', this.filterAll);
		this.listenTo(app.Library, 'all', this.render);
		this.listenTo(app.Library, 'details', function(event){
			this.renderDetails(event);
		});
		
		this.$filters = this.$('#filters');
		
		var self = this;
		
		app.Library.fetch({
			success: function(model){
				if(!app.Library.length){ // If nothing in storage grab the initial books
					app.Library.add(initialBooks);
				}
				app.LibraryRouter = new LibraryRouter();
				Backbone.history.start();
				self.renderAll();
			}
		});
		
	},
	
	events: {
		'click #mask': 'closeDetails' //mask is outside of the DetailsView scope
	},
	
	render: function(){
		var collected = app.Library.collected().length;
		var remaining = app.Library.remaining().length;
	
		if ( collected ) {
			this.$filters.show();
			this.$('#filters li').removeClass('active');
			this.$('#filters a').filter('[href="#/' + ( app.BookFilter || '' ) + '"]').parent().addClass('active');
			
			this.$('.numCollected').html(collected);
			this.$('.numRemaining').html(remaining);
		} else {
			this.$filters.hide();
			this.renderAll();
			if(app.LibraryRouter) app.LibraryRouter.navigate('');
		}
	},
	
	renderAll: function() {
		this.$('#albums').html('');
		app.Library.each(this.renderBook, this);
		
	},
	
	renderBook: function( book ) {
		var bookView = new app.BookView({
			model: book
		});
		this.$('#albums').append( bookView.render().el );
	},
	
	renderDetails: function( volume ) {
		
		this.bookDetailsView = new app.BookDetailsView({
			model: volume
		});
		this.$('#details').append( this.bookDetailsView.render().el );
		var detailContainer = this.$('#details').children();
		var maskHeight = $(document).height();
		var maskWidth = $(window).width();
		
		var winH = $(window).height()/2-$(detailContainer).height()/2;
		if(winH > 200) winH = 200;
		var winW = $(window).width()/2-$(detailContainer).width()/2;
		
		if(maskWidth > 767){ // Responsive
			$('#mask').css({'width':maskWidth,'height':maskHeight});
			$('#mask').fadeTo(1000,0.8);	
		}
		
		$(detailContainer).fadeIn(1000);
		$(detailContainer).css({
			'top': winH,
			'left': winW
		});
		
	},
	
	filterOne : function (book) {
		if(book) book.trigger('visible');
	},
	
	filterAll : function () {
		app.Library.each(this.filterOne, this);
	},
	
	closeDetails: function(){
		
		this.bookDetailsView.close();
	}
});

// Book View - Details
app.BookDetailsView = Backbone.View.extend({
	
	
	
	tagName: 'div',
	
	className: 'detail',
	
	template: _.template( $( '#albumDetails-template' ).html() ),
	
	initialize: function(){
		this.listenTo(app.Library, 'all', this.render);
		this.listenTo(app.Library, 'close', this.close);
	},
	
	events: {
		'click .close': 'close',
	},
	
	render: function(){
		this.$el.html(this.template(this.model.toJSON()));
		return this;
	},
	
	
	
	close: function(e){
		if(e) e.preventDefault(); //Check if clicking on mask or close button
		this.$el.fadeOut('fast').parent().html('');
		$('#mask').fadeOut('fast');
		var tempScroll = $(window).scrollTop(); // Get scroll position. navigate('') causes hash jumping...
		app.LibraryRouter.navigate('');
		$(window).scrollTop(tempScroll); // Return scroll position to where it was when modal was closed. Is there a better way?
	}
});

// Routers
var LibraryRouter = Backbone.Router.extend({
	routes: {
		'albums/:volume': 'bookDetails',
		'*filter': 'setFilter'
	},

	setFilter: function( param ) {
		
		if (param) {
			param = param.trim();
		}
		
		app.BookFilter = param || '';

		app.Library.trigger('filter');
	},
	
	bookDetails: function(volume){
		// Get the id of the model based on the volume attribute from the router. Is there an easier way?
		var temp = app.Library.chain().filter(function(item){return item.get('volume') == volume}).map(function(item){return item.get('id')}).value();
		var newTemp = app.Library.get(temp); // Get the model based upon the model id from above
		app.Library.trigger('details', newTemp); // Pass the model and trigger details in the Library
	}
	
});

$(function() {
	var books = [
    {
        "volume": 1,
        "title": "Asterix the Gaul",
        "year": "1961",
        "description": "The Romans discover that the secret of the Gauls' strength is the magic potion brewed by the druid Getafix, so they decide to capture the druid and get the recipe out of him. It is up to Asterix and his wits to save Getafix.",
        "image": "img/01gb.jpg"
    },
    {
        "volume": 2,
        "title": "Asterix and the Golden Sickle",
        "year": "1962",
        "description": "Getafix's sickle breaks, so Asterix and Obelix volunteer to go to Lutetia to buy a new one. But there is a mysterious sickle shortage our heroes must get to the bottom of.",
        "image": "img/02gb.jpg"
    },
    {
        "volume": 3,
        "title": "Asterix and the Goths",
        "year": "1963",
        "description": "The druid Getafix is captured by a tribe of Goths, and Asterix and Obelix must rescue him.",
        "image": "img/03gb.jpg"
    },
    {
        "volume": 4,
        "title": "Asterix the Gladiator",
        "year": "1964",
        "description": "Odius Asparagus, the prefect of Gaul, captures Cacofonix and sends him as a present to Caesar. Unimpressed by Cacofonix, Caesar orders him to be thrown to the Lions at the Circus Maximus. Asterix and Obelix hitchhike all the way to Rome where they must become gladiators to rescue him.",
        "image": "img/04gb.jpg"
    },
    {
        "volume": 5,
        "title": "Asterix and the Banquet",
        "year": "1965",
        "description": "Unsuccessful at conquering the village, the Romans decide to isolate it by building a stockade. To remove it, Asterix strikes a bet with the Romans that he and Obelix can travel throughout Gaul and back to the village with various Gaulish delicacies without the Romans being able to stop them. The route is a parallel to the modern Tour de France cycling event. It's in this adventure that Obelix gets his dog, Dogmatix.",
        "image": "img/05gb.jpg"
    },
    {
        "volume": 6,
        "title": "Asterix and Cleopatra",
        "year": "1965",
        "description": "Caesar calls the Egyptians inferior to the Romans. Outraged, Cleopatra wagers with him that her people can build a grand monument in record time. Edifis, a bumbling, timid architect is asked to perform the miracle, and asks his old friend Getafix for help. Meanwhile, his rival and Caesar's agents attempt to sabotage the effort.",
        "image": "img/06gb.jpg"
    },
    {
        "volume": 7,
        "title": "Asterix and the Big Fight",
        "year": "1966",
        "description": "The Romans conspire with a Roman-friendly Gaulish village to declare a ritual winner-takes-all fight between the village chiefs. One of Obelix's menhirs causes Getafix to lose his memory, leaving the Gauls without magic potion. The fight parodies professional boxing.",
        "image": "img/07gb.jpg"
    },
    {
        "volume": 8,
        "title": "Asterix in Britain",
        "year": "1966",
        "description": "One small village in Britain still holds out against the Roman invaders. But with no Magic Potion, they need help, so Asterix's cousin Anticlimax comes to Gaul seeking aid.",
        "image": "img/08gb.jpg"
    },
    {
        "volume": 9,
        "title": "Asterix and the Normans",
        "year": "1966",
        "description": "The Normans are fearless to the point of not even understanding the concept, so they travel to Gaul where they kidnap chief Vitalstatistix's cowardly visiting nephew Justforkix to teach them fear.",
        "image": "img/09gb.jpg"
    },
    {
        "volume": 10,
        "title": "Asterix the Legionary",
        "year": "1967",
        "description": "Asterix and Obelix join the Roman Legion (in a parody of the French Foreign Legion) in an attempt to find the conscripted fiancé of Panacea, a villager on whom Obelix has a big crush. With an eclectic group of foreigners, they are sent to North Africa to fight the traitor Scipio.",
        "image": "img/10gb.jpg"
    },
    {
        "volume": 11,
        "title": "Asterix and the Chieftain's Shield",
        "year": "1968",
        "description": "After too many banquets, chief Vitalstatistix is forced to visit a spa in the Arvernian countryside to nurse his sore liver. Meanwhile, Caesar orders his men to search the area for the shield of Vercingetorix, regarded as a patriotic symbol by the Gauls.",
        "image": "img/11gb.jpg"
    },
    {
        "volume": 12,
        "title": "Asterix at the Olympic Games",
        "year": "1968",
        "description": "To participate in the Olympic Games in Greece, the Gauls register themselves as Romans. When the officials declare the magic potion to be a form of illegal doping, Asterix turns to his native abilities to compete.",
        "image": "img/12gb.jpg"
    },
    {
        "volume": 13,
        "title": "Asterix and the Cauldron",
        "year": "1969",
        "description": "Whosemoralsarelastix, chief of a nearby village, asks Vitalstatistix to hide his village's money to prevent the Romans from taking it. When the money is stolen under his watch, Asterix is banished until he can repay the money and recover his honour.",
        "image": "img/13gb.jpg"
    },
    {
        "volume": 14,
        "title": "Asterix in Spain",
        "year": "1969",
        "description": "Pepe, a young and spoiled child, is taken from the Romans. He turns out to be Spanish, and held hostage in an attempt to get them to surrender. Asterix and Obelix escort the child back to Spain.",
        "image": "img/14gb.jpg"
    },
    {
        "volume": 15,
        "title": "Asterix and the Roman Agent",
        "year": "1970",
        "description": "A troublemaker is brought to Caesar in Rome; he was to be executed in the Colosseum, but is so conniving that he got the lions to eat each other instead. Caesar sends him to the Gaulish village in an attempt to destroy unity.",
        "image": "img/15gb.jpg"
    },
    {
        "volume": 16,
        "title": "Asterix in Switzerland",
        "year": "1970",
        "description": "A poisoned Roman tax inspector seeks sanctuary in the village. Asterix and Obelix are sent to Switzerland to recover a Silver Star, or Edelweiss, which is needed to cure him.",
        "image": "img/16gb.jpg"
    },
    {
        "volume": 17,
        "title": "The Mansions of the Gods",
        "year": "1971",
        "description": "Caesar tries to dilute solidarity and weaken local customs in Gaul by creating a vacation resort near the Village. The villagers sabotage the efforts, first by magically replanting the forest as soon as it's cut, and by creating a slaves' union; later by being obnoxious neighbors to the resident Romans.",
        "image": "img/17gb.jpg"
    },
    {
        "volume": 18,
        "title": "Asterix and the Laurel Wreath",
        "year": "1972",
        "description": "Thoroughly chagrined by his obnoxious brother-in-law, Vitalstatistix gets drunk and boasts that he will create a dish seasoned with Caesar's laurel wreath. He orders Asterix and Obelix travel to Rome to retrieve it.",
        "image": "img/18gb.jpg"
    },
    {
        "volume": 19,
        "title": "Asterix and the Soothsayer",
        "year": "1972",
        "description": "In the absence of Getafix, a fraudulent seer seeks shelter against rain in the Village, then ingratiates himself to everyone by predicting the futures they want to hear, asking no food or money, merely items to \"read\" the future in (mainly as food and money). Unbeknown to the Gauls, he is hired by the Romans to convince the Gauls to abandon the village by that disaster would befall the village were he to be chased off.",
        "image": "img/19gb.jpg"
    },
    {
        "volume": 20,
        "title": "Asterix in Corsica",
        "year": "1973",
        "description": "As part of the celebrations of the anniversary of Vercingetorix's victory at the Battle of Gergovia, the Gauls and their friends raid one of the nearby Roman camps. A very stoic and composed prisoner is discovered, who reveals himself as Boneywasawarriorwayayix, a tribal leader from Corsica. Asterix and Obelix accompany him back to Corsica, to unite the quarrelling tribes against the Romans.",
        "image": "img/20gb.jpg"
    },
    {
        "volume": 21,
        "title": "Asterix and Caesar's Gift",
        "year": "1974",
        "description": "At the end of their career, legionaries are granted estate in the Empire to settle down. A perpetually inebriated soldier is given the Village, by Caesar's hand, which he promptly sells to an innkeeper for wine. Pushed by his dominant wife, the innkeeper sells his property and attempts to claim the village as his own. Upon discovering that his ownership is void, he campaigns to be elected chief, causing rivalries to ensue throughout the village. To complicate matter, the soldier returns and asks the local legions' aid in reclaiming his village, since he didn't get enough wine for it.",
        "image": "img/21gb.jpg"
    },
    {
        "volume": 22,
        "title": "Asterix and the Great Crossing",
        "year": "1975",
        "description": "Brewing the magical potion requires fresh fish, and Unhygienix has none since he imports it from Lutetia (Paris) (in spite of living near the sea). Asterix and Obelix sail out to catch fish, but become lost and end up on the other side of the ocean, discovering a New World, where they eventually become a legend to the Native American populace. Soon afterwards, a Viking explorer discovers America, and captures the first natives he finds (i.e. them) and brings them home. A running joke in this comic is that none of the races are able to understand one another, the Vikings speaking with Scandinavian vowels that the Gauls are unable to duplicate, but that their dogs are able to communicate perfectly.",
        "image": "img/22gb.jpg"
    },
    {
        "volume": 23,
        "title": "Obelix and Co.",
        "year": "1976",
        "description": "Caesar sends one of his advisors to the Gaulish village, in an effort to make them rich, decadent and utterly dependent on Rome. He starts by buying menhirs at ever-increasing prices, thus persuading most of the village to make useless menhirs, and in turn employing other villagers to hunt for their food. The plan goes awry when Caesar's treasury turns out insufficient to fund the menhirs, and a commercial campaign to sell them in Rome fails because of competition from Egyptian menhirs and slave-made Roman menhirs.",
        "image": "img/23gb.jpg"
    },
    {
        "volume": 24,
        "title": "Asterix in Belgium",
        "year": "1979",
        "description": "When Vitalstatistix hears that Caesar has said that the Belgians are the bravest of all the Gaulish peoples he heads to Belgium in a huff to show the world that his Armoricans are really the best.",
        "image": "img/24gb.jpg"
    },
    {
        "volume": 25,
        "title": "Asterix and the Great Divide",
        "year": "1980",
        "description": "Asterix and Obelix visit a village divided in half by its rival chiefs. However, one chief's son and the other's daughter are in love, and together with Asterix and Obelix, they reunite the village. The dividing chasm itself resembles the Berlin Wall. There is also a reference here to Romeo and Juliet.[original research?]",
        "image": "img/25gb.jpg"
    },
    {
        "volume": 26,
        "title": "Asterix and the Black Gold",
        "year": "1981",
        "description": "Getafix has run out of rock oil and sends Asterix and Obelix to Mesopotamia in search of it. They are accompanied by a Gaulish-Roman druid called Dubbelosix, who is really a double agent seeking to foul their mission. Includes a tribute to Goscinny, who was Jewish.",
        "image": "img/26gb.jpg"
    },
    {
        "volume": 27,
        "title": "Asterix and Son",
        "year": "1983",
        "description": "A baby boy mysteriously turns up at Asterix's doorstep. No one in the village knows who he is, so Asterix is forced to be his adoptive father. Meanwhile, the Roman legions led by Brutus are after the baby, because in reality, he is Caesar's full-blooded son, Caesarion.",
        "image": "img/27gb.jpg"
    },
    {
        "volume": 28,
        "title": "Asterix and the Magic Carpet",
        "year": "1987",
        "description": "A fakir from far-away India travels to Asterix's village and asks Cacofonix to save his land from drought since his horrible voice can make it rain. Cacofonix, accompanied by Asterix and Obelix, must travel to India aboard a magic carpet to save the life of the princess Orinjade, who is to be sacrificed to stop the drought.",
        "image": "img/28gb.jpg"
    },
    {
        "volume": 29,
        "title": "Asterix and the Secret Weapon",
        "year": "1991",
        "description": "A feminist satire in which a female bard called Bravura replaces Cacofonix as school teacher and \"liberates\" the village women, causing the men to leave and live in the forest. Caesar secretly sends a battalion of female legionaries to conquer the village, having heard that the Gauls will not strike a woman. The men and woman have to settle their differences to overcome this threat.",
        "image": "img/29gb.jpg"
    },
    {
        "volume": 30,
        "title": "Asterix and Obelix All at Sea",
        "year": "1996",
        "description": "Left alone in Getafix's hut, Obelix drinks a whole cauldron of magic potion. He first turns to stone, then into a small boy. Meanwhile, a group of men have escaped from Roman slavery on board a ship. Together, they travel to Atlantis to make Obelix a grown man again.",
        "image": "img/30gb.jpg"
    },
    {
        "volume": 31,
        "title": "Asterix and the Actress",
        "year": "2001",
        "description": "A Roman actress pretends to be Panacea in order to steal back a fancy sword/scabbard and helmet belonging to Pompey, which Asterix and Obelix got for their birthday before Caesar learns Pompey is in Armorica.",
        "image": "img/31gb.jpg"
    },
    {
        "volume": 32,
        "title": "Asterix and the Class Act",
        "year": "2003",
        "description": "A collection of several short stories, including an experiment at different drawing and storytelling styles. Some stories are written by Goscinny.",
        "image": "img/32gb.jpg"
    },
    {
        "volume": 33,
        "title": "Asterix and the Falling Sky",
        "year": "2005",
        "description": "Two rival outer space alien ships appear above the Gaulish village. The aliens want to know the secret of the great weapon the Gauls have, which is \"known throughout the universe\". The aliens are styled on the happy-faced Walt Disney and Marvel Comics superheroes of the American comic book style on one side, and futuristic robot and insect-like Japanese manga style on the other. The album is explained by Uderzo as a tribute to Walt Disney, who inspired him to be an artist. Reception of the album was mixed, with many fans criticizing the sci-fi setting, and thinly veiled references to the Bush administration. Despite this criticism, the album was not disliked by everyone, and reportedly sold well.",
        "image": "img/33gb.jpg"
    },
    {
        "volume": 34,
        "title": "Asterix and Obelix's Birthday: The Golden Book",
        "year": "2009",
        "description": "Several short stories, including some written by Goscinny.",
        "image": "img/34gb.jpg"
    }
];

	new app.LibraryView( books );
});