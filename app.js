const logger = require('./utils/logger'),
	fs = require('fs'),
	axios = require('axios'),
	nodemailer = require('nodemailer'),
	IcsCreate = require('./lib/icsCreate.js'),
	HolCreate = require('./lib/holCreate.js'),
	file = require('./lib/file.js'),
	config = require('./config.json')
	CronJob = require('cron').CronJob;

let liveHolData;

// TODO 
// ----
// Programatically update box.
// ----

// Switches
//	'SET STAGE=1 & node app' - Uses the stage DB instead of prod
// 	'SET LOGGER=silly & node app' - Logs everything to console
//	'SET SKIPEMAIL=1 & node app'- Does not send an email
//	'SET FORCE=1 & node app' - Forces a build even if the data is up to date
//  'SET SKIPDB=1 & node app' - Skips writing to the DB
//  'SET CONVERT=1 & node app' - Converts a HOL file to an ICS, put the hol file in the convert folder and name it holiday.hol
//  'SET RUNLOCAL=1 & node app' - Runs the app once with no email and no cron
//  'SET PROD=1 & node app' - Runs the app in production

if (process.env.RUNLOCAL == 1) {
	start();
} else if (process.env.PROD == 1) {
	logger.verbose("Production running");
	new CronJob('0 0 * * * *', function() {
		start();
	}, null, true, 'Europe/London', null, true);
} else if (process.env.CONVERT == 1) {
	convertHoltoICS();
} else {
	logger.verbose("\n\nPlease use one of the following switches:" +
		"\n\n'SET STAGE=1 & node app' - Uses the stage DB instead of prod" +
		"\n'SET LOGGER=silly & node app' - Logs everything to console" +
		"\n'SET SKIPEMAIL=1 & node app' - Does not send an email" +
		"\n'SET FORCE=1 & node app' - Forces a build even if the data is up to date" +
		"\n'SET SKIPDB=1 & node app' - Skips writing to the DB" +
		"\n'SET CONVERT=1 & node app' - Converts a HOL file to an ICS, put the hol file in the convert folder and name it holiday.hol" +
		"\n'SET RUNLOCAL=1 & node app' - Runs the app once with no email and no cron" +
		"\n'SET PROD=1 & node app' - Runs the app in production\n"
	);
}

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
		logger.verbose('Finished');

	}).catch((err) => {
		logger.error(err);
	});
}

function pullLiveData() {
	return new Promise((resolve, reject) => {

		axios.get(config.server, {
			auth: {
				username: config.username,
				password: config.password
			}
		}
		).then((res) => {
			resolve(res.data.sections);
		}).catch((err) => {

			//console.log(err.response.status == 401);

			if(err.response.status == 401) {
				console.log(creds);
				logger.error(err.response.body);
				reject("Unauthorised. Your credentials may be wrong. Please update them in creds.js. Press CTRL + C to stop running");
			} else {
				reject(err);
			}
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

	let holFile = fs.readFileSync("./convert/holiday.hol", "utf-8").split("\n");

	if (holFile.indexOf("\r\n") != -1) {
		holFile.split("\r\n");
	} else if (holFile.indexOf("\r") != -1) {
		holFile.split("\r");
	} else if (holFile.indexOf("\n") != -1) {
		holFile.split("\n");
	}

	holFileJson = {};


	// Converts the hol file into JSON that is readable by the icsCreate.build method
	for (let [key, line] of Object.entries(holFile)) {
		// Gets the first line of the file
		if(key == 0) {
			// Get text between the two specifed characters
			holFileJson.name = line.substring(line.lastIndexOf("[")+1,line.lastIndexOf("]"));
			holFileJson.holidays = [];
			continue;
		}
			// Splits the line to get event name and date in array
			let items = line.split(',');

			let holFileJsonEvent = {name: items[0], date: items[1].replace(/\//g,'-')};

			holFileJson.holidays.push(holFileJsonEvent);
	}

	let icsCreate = new IcsCreate(holFileJson);

	icsCreate.build().then((res) => {
		file.writeCalFile("ics", 'converted', holFileJson.name, res).then((res) => {
			logger.verbose("hol file converted to ICS - Saved in public/files/ics/converted");
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
			to: config.emailTo,
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

