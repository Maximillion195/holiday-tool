class holCreate {

	constructor (data) {

       	this.countryName = data.name;
       	this.events = data.holidays;
    }

    eventBlock () {

    	var eventBlock = [];
    	this.eventCount = 0;

	    for (var i = this.events.length - 1; i >= 0; i--) {

	    	this.eventCount++;
			eventBlock.push(this.events[i].name + "," + this.events[i].date.replace(/-/g, '/'));	
	    }
	    return eventBlock.join('\n');
    }

    build () {
    	return new Promise((resolve, reject) => {
	    	//var eventBlock = this.eventBlock();

		    resolve([
		    	"[" + this.countryName + "] " + this.eventCount,
		    	this.eventBlock()
		    ].join('\n'));
		});
    }
}

module.exports = holCreate;