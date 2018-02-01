class icsCreate {

	constructor (data) {

       	this.countryName = data.name;
       	this.events = data.holidays;
       	this.dateStamp = new Date();

    }

    eventBlock () {

    	var eventBlock = [];
    	this.eventCount = 0;


    	for (let event of this.events) {

	    	this.eventCount++;

			var dateStamp = this.dateStamp.toISOString().replace(/[Z:.-]/g, '');

			var catName = "Holiday";
			if (this.countryName.indexOf('Payroll') > -1) { catName = "Payroll"; }
			if (this.countryName.indexOf('Cisco FY') > -1) { catName = "Cisco FY Dates"; }

			eventBlock.push([
		    	"\nBEGIN:VEVENT",
				"DTSTAMP:" + dateStamp,
				"UID:" + dateStamp + "-" + this.ranAlphaNum() + "@cisco.com",
				"DTSTART;VALUE=DATE:" + event.date.replace(/-/g, ''),
				"DTEND;VALUE=DATE:" + this.getEndDate(event.date),
				"LOCATION:" + this.countryName,
				"CATEGORIES:" + catName,
				"DESCRIPTION:" + "Cisco Approved Holiday",
				"X-MICROSOFT-CDO-BUSYSTATUS:FREE",
				"TRANSP:TRANSPARENT",
				"SUMMARY:" + event.name,
				"END:VEVENT"
			].join('\n'));
    	}
	    return eventBlock.join('\n');
    }

    getEndDate(startDate) {

    	var tomorrow = new Date(startDate);

    	var date = tomorrow.setDate(tomorrow.getDate() + 1);

    	var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

	    if (month.length < 2) month = '0' + month;
	    if (day.length < 2) day = '0' + day;

	    return [year, month, day].join('');
    }

    ranAlphaNum () {

    	return Math.random().toString(36).split('').filter((value, index, self) => { 
        	return self.indexOf(value) === index;
    	}).join('').substr(2,8);
    }

    build () {
    	return new Promise((resolve, reject) => {
		    resolve([
		    	"BEGIN:VCALENDAR",
				"VERSION:2.0",
				"PRODID:Cisco iCal Creator",
				"X-WR-CALNAME:" + this.countryName,
				"CALSCALE:GREGORIAN",
		    	this.eventBlock(),
		    	"\nEND:VCALENDAR",
		    ].join('\n'));
	    });
    }
}


module.exports = icsCreate;