const fs = require('fs-extra');
const moment = require('moment');
const hash = require('string-hash');
logger = require('../utils/logger');
var exp = module.exports;

if(process.env.STAGE == 1) {
	dbName = './db/db-stage.json';
	logger.verbose("Stage running");

} else {
	dbName = './db/db-prod.json';
}

// Database stuff
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync(dbName);
const db = low(adapter);
const shortid = require('shortid');

// Set some defaults
db.defaults({ holidayData: [] })
  .write();


// TODO: You could create a hash of the data to compare as this would be faster
exp.compare = function compare(liveData) {
	return new Promise((resolve, reject) => {

		// Gets the latest holdiay data from db
		const query = db.get('holidayData').last().value()

		// If there is no data in the DB
		if(query == undefined) {
			resolve("nodata");
		}

		logger.silly(`Latest log: ${ query.date }`);

		// Compare hashes
		if(hash(JSON.stringify(liveData)) == query.hash) {
			reject({notError: 'No holiday updates.'});
			//resolve('Data hasn\'t changed. Doing nothing')
		} else {

			detailedCompare(liveData, JSON.parse(query.data)).then((res) => {
				resolve(res);
			}).catch((err) => {
				logger.error(err);;
			});

		}

	});
}


function detailedCompare(liveData, oldData) {
	return new Promise((resolve, reject) => {

		let changes = [];

		for (let country of liveData) {

			for (let secondCountry of oldData) {

				if(country.name == secondCountry.name) {

					if(JSON.stringify(country.holidays) != JSON.stringify(secondCountry.holidays))
					{
						changes.push(country.name);
					}			
				}

			}
		}

		resolve(changes);
	});
}

exp.writeJsonLog = function writeJsonLog(data) {
	return new Promise((resolve, reject) => {

		let uniqueId = shortid.generate();
		let dataString = JSON.stringify(data);
		let date = moment().format("dddd, MMMM Do YYYY, h:mm:ss a");

		// Log to DB
		db.get('holidayData')
		  .push({ id: uniqueId, date: date, hash: hash(dataString), data: dataString })
		  .write()
	        
        resolve("JSON data written to db");		
	});
}

exp.writeCalFile = function writeCalFile(type, year, name, data) {
	return new Promise((resolve, reject) => {

		let filePath = './public/files/' + type + '/' + year;

   		fs.outputFile(filePath  + '/' + name + '.' + type, data, 'utf-8').then(() => {

			logger.silly(`${ name } ${ type } file created`);
        	resolve("File created");

		}).catch(err => {
			logger.silly(err);
		 	reject(err);
		}) 		
	});
}