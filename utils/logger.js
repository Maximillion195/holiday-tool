const //winston = require('winston'),
	fs = require('fs-extra'),
    logDir = './logs';
    
var winston = require('winston');

// Create time stamp
const tsFormat = () => (new Date()).toLocaleTimeString();

// Create the log directory if it does not exist
fs.ensureDir(logDir).catch(err => {
 	console.error(err);
})

winston = new (winston.Logger)({  
    transports: [
        new (winston.transports.Console)({ timestamp: tsFormat, colorize: true, level: process.env.LOGGER || 'debug' }),
        new (winston.transports.File)({ filename: __dirname + '/../logs/production.log', timestamp: tsFormat, level: 'debug' })
    ]
});

//winston.info('Chill Winston, the logs are being captured 2 ways - console and file')

module.exports = winston;  