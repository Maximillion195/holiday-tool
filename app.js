const logger = require('./utils/logger'),
	fs = require('fs'),
	axios = require('axios'),
	nodemailer = require('nodemailer'),
	IcsCreate = require('./lib/icsCreate.js'),
	HolCreate = require('./lib/holCreate.js'),
	file = require('./lib/file.js'),
	creds = require('./creds.js')
	CronJob = require('cron').CronJob;

let liveHolData;

// TODO 
// ----
// Programatically update box.
// ----

// Switches
//	STAGE=1 - Uses the stage DB instead of prod
// 	LOGGER=silly - Logs everything to console
//	SKIPEMAIL=1 - Does not send an email
//	FORCE=1 - Forces a build even if the data is up to date
//  SKIPDB=1 - Skips writing to the DB
//  RUNLOCAL=1 - Runs the app once with no email and no cron
//  PROD=1 - Runs the app in production

if (process.env.RUNLOCAL == 1) {
	start();
} else if (process.env.PROD == 1) {
	logger.verbose("Production running");
	new CronJob('0 0 * * * *', function() {
		start();
	}, null, true, 'Europe/London', null, true);
} else {
	logger.verbose("\n\nPlease use one of the following switches:" +
		"\n\nSTAGE=1 - Uses the stage DB instead of prod" +
		"\nLOGGER=silly - Logs everything to console" +
		"\nSKIPEMAIL=1 - Does not send an email" +
		"\nFORCE=1 - Forces a build even if the data is up to date" +
		"\nSKIPDB=1 - Skips writing to the DB" +
		"\nRUNLOCAL=1 - Runs the app once with no email and no cron" +
		"\nPROD=1 - Runs the app in production\n"
	);
}

//convertHoltoICS();

function start() {

	// Force building live data
	let force = process.env.FORCE || 'no';

	logger.verbose('Pulling live holiday data');

	pullLiveData().then((data) => {

		liveHolData = data;

		logger.verbose('Pulled live holiday data');
		// Compare the new date to the stored data
		if (force  == 'no') {
			return file.compare(data).then((changes) => {

				// Check to see if theres data in the db
				if (changes == 'nodata') {
					logger.verbose(`No previous data. Writing new log and building ICS files`);
					return buildFiles(liveHolData, changes);
				} else {
					logger.verbose(`${ changes } has been updated.`);
				}

				if (process.env.RUNLOCAL != 1) {
					logger.verbose(`Sending update email`);
					logger.verbose(`Writing new log and building ICS files`);
					let p1 = emailChanges(changes);
					let p2 = buildFiles(liveHolData, changes);
					return Promise.all([p1, p2]);
				} else {
					logger.verbose(`Writing new log and building ICS files`);
					return buildFiles(liveHolData, changes);
				}	

			}).then((res) => {

				if (typeof res == "string") {
					logger.verbose(res);
				} else {
					logger.verbose(res[0]);
					logger.verbose(res[1]);					
				}

				if (process.env.SKIPDB != 1) {
					return file.writeJsonLog(liveHolData);
				} else {
					return 'Skipped writing to DB';
				}	

			}).catch((err) => {
				if(err.notError) {
					// Promise is rejected to skip the Json compare and log build
					return err.notError;
				} else {
					logger.error(err.toString());
				}				
			});
		} else {
			logger.verbose(`Building ICS files`);
			return buildFiles(liveHolData);
		}

	}).then((res) => { 
		//Json Log written
		logger.verbose(res);
		logger.verbose('Finshed');

	}).catch((err) => {
		logger.error(err);
	});
}

function pullLiveData() {
	return new Promise((resolve, reject) => {

		axios.get('https://ews-aln-core.cisco.com/xxexchng/tools/holidays.cgi?cmd=Holidays', {
			auth: {
				username: creds.username,
				password: creds.password
			}
		}
		).then((res) => {

			resolve(res.data.sections);

		}).catch((err) => {
			reject(err);
		});
	});
}

function buildFiles(holidayData, changes) {
	return new Promise((resolve, reject) => {	

		let filesCreated = 0

		// Object.entries(holidayList) Allows you to get the key value as well
		for (let [key, value] of Object.entries(holidayData)) {

			// This causes early end, remove to process all the holidays
//			if(key == 3) { break; }
			
			// If there was no data in the db write all the holidays
			if(changes == 'nodata') {
				filesCreated++;
			// If country is not in the changes array
			}else if(changes.indexOf(value.name) == -1) {
				continue; 
			} else {
				filesCreated++;
			}

			// Creates a new object adding the holiday data in and outputting a full ics file 
			let icsCreate = new IcsCreate(value);
			let holCreate = new HolCreate(value);

			Promise.all([icsCreate.build(), holCreate.build()]).then((res) => {

				let p1 = file.writeCalFile("ics", value.year, value.name, res[0]);
				let p2 = file.writeCalFile("hol", value.year, value.name, res[1]);

				return Promise.all([p1, p2]);

			}).then((res) => {
				//logger.verbose(res);
				resolve(filesCreated - 1 + " calendar files created");
			}).catch((err) => {
				logger.silly(err);
				reject(err);
			})
		}
	});
}

function convertHoltoICS(holData) {

	let holFile = fs.readFileSync("./convert/holFile.hol", "utf-8").split("\r");

	holFileJson = {};

	for (let [key, line] of Object.entries(holFile)) {

		if(key == 0) {
			// Get text between the two specifed characters
			holFileJson.name = line.substring(line.lastIndexOf("[")+1,line.lastIndexOf("]"));
			holFileJson.holidays = [];
			continue;
		}

		let items = line.split(',');

		let holFileJsonEvent = {name: items[0], date: items[1].replace(/\//g,'-')};

		holFileJson.holidays.push(holFileJsonEvent);
	}

	let icsCreate = new IcsCreate(holFileJson);

	icsCreate.build().then((res) => {
		file.writeCalFile("ics", '2018', holFileJson.name, res).then((res) => {
			logger.verbose("Hol file converted to ICS");
		});
	})
}

function emailChanges(changes) {
	return new Promise((resolve, reject) => {

		let transporter = nodemailer.createTransport({
			host: 'outbound.cisco.com',
			port: 25,
			secure: false
		});

		let attachments = changes.map(x => path = {path: "./public/files/ics/2018/" + x + '.ics'});

		let mailOptions = {
			from: "Holiday Tool <noreply@cisco.com>", // Sender
			to: `holiday-tool@cisco.com`,
			subject: "Updates",
			attachments: attachments,
			html: `These countries have been updated:<br><br>${ changes.join('<br>') }`
		};

		transporter.sendMail(mailOptions, (error, info) => {
			if (error) {

				reject(error);
				return;
			}

			logger.silly({'sentTo': mailOptions.to, 'messageID': info.messageId, 'info': info.response});

			resolve(`Mail sent to ${ mailOptions.to }`);

		});

	});
}

