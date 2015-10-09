'use strict';

/**
 * CDS Pipe Tool main module
 * 
 * @author David Taieb
 */

var express = require('express');
var fs = require('fs');
var path = require('path');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var expressSession = require("express-session");
var errorHandler = require('errorhandler');
var morgan = require('morgan');// morgan is a middleware logger
var bluemixHelperConfig = require('bluemix-helper-config');
var global = bluemixHelperConfig.global;
var configManager = bluemixHelperConfig.configManager;
var callERS = require('./callERS.js');
//var methodOverride = require('method-override');
var http = require('http');

var VCAP_APPLICATION = JSON.parse(process.env.VCAP_APPLICATION || "{}");
var VCAP_SERVICES = JSON.parse(process.env.VCAP_SERVICES || "{}");

var app = global.app = express();

//Enforce https on Bluemix
app.use( function( req, res, next ){
	if ( req.headers && req.headers.$wssc === 'http'){
		console.log("Automatically redirecting to https...");
		return res.redirect('https://' + req.get('host') + req.url);
	}
	return next();
});

if ( process.env.START_PROXY ){
	//Development only, creates a proxy server to enable local environment access to dw servers
	var dataworks = require("nodejs-dataworks").dataload;
	var dwInstance = new dataworks();
}

app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(errorHandler({ dumpExceptions:true, showStack:true }));

app.use(expressSession({
	secret: "simple_data_pipe"
}));

var env = app.get('env');
if ('production' === env) {
	app.use(morgan('dev'));
}

if ('development' === env || 'test' === env) {
	app.use(morgan('dev'));
	app.use(errorHandler()); // Error handler - has to be last
}

var port = process.env.VCAP_APP_PORT || configManager.get("DEV_PORT");
if (!process.env.VCAP_APP_HOST){
	//Running locally. Salesforce requires authCallbacks to use SSL by default
	global.appHost = "https://127.0.0.1";
	global.appPort = port;
}

//Configure security if we are bound to an SSO service
var ssoService = bluemixHelperConfig.vcapServices.getService( "pipes-sso" );
if ( ssoService ){
	console.log("INFO: Security is enabled");
	require('bluemix-helper-sso')(app, {
		ssoService: ssoService,
		relaxedUrls:[
		    "/js", "/img", "/css", "/bower_components", "templates"
		],
		createSessionStore: function( session ){
			//Create a session store based on redis if available, if not, use the default in-memory store
			var redisService = bluemixHelperConfig.vcapServices.getService("pipes-redis");
			if ( redisService ){
				var redisStore = require('connect-redis')(session);
				return new redisStore({
					host: redisService.credentials.hostname,
					port: redisService.credentials.port,
					pass: redisService.credentials.password
				});
			}
			return null;
		}
	});
}else{
	app.get("/userid", function( req, res, next ){
		res.status(200).end();
	})
}

app.use(express.static(path.join(__dirname, 'app')));

//Configure the endpoints
require("./server/connectorAPI").initEndPoints(app);	//Pipe connector API
var wssConfigurator = require("./server/pipeAPI")(app);	//Pipe configuration

var connected = function() {
	console.log("Pipes Tool started on port %s : %s", port, Date(Date.now()));
};

var options = {
  key: fs.readFileSync('development/certs/server/my-server.key.pem'),
  cert: fs.readFileSync('development/certs/server/my-server.crt.pem')
};

// VCAP_SERVICES contains all the credentials of services bound to
// this application. For details of its content, please refer to
// the document or sample of each service.
var services = JSON.parse(process.env.VCAP_SERVICES || "{}");
// Returns array of services object enumerable properties
// In this case it's the credentials used to connect to the bound service
Object.keys(services).forEach(function(key) {
	var name = key.toString().toUpperCase();
	var credentials = services[key][0]['credentials'];
	if (name.indexOf('ERSERVICE') !== -1) {
		reportingUri = credentials['url'];
		reportingUserId = credentials['userid'];
		reportingPassword = credentials['password'];
	}
	else if ((name.indexOf("CLOUDANT") !== -1) && (bundleUri == null)) {

		bundleUri = credentials['url'];
	}
	else if ((name.indexOf("MONGOLAB") !== -1) && (bundleUri == null)) {
		bundleUri = credentials['uri'];
	}
	else if ((name.indexOf("MONGO") !== -1) && (bundleUri == null)) {
		bundleUri = credentials['url'];
	}
	else if ((name.indexOf("SQLDB") !== -1) && (jdbcUri == null)) {
		jdbcUri = credentials['jdbcurl'];
		dsUserId = credentials['username'];
        dsPassword = credentials['password'];
	}
	else if ((name.indexOf("DASHDB") !== -1) && (jdbcUri == null)) {
		jdbcUri = credentials['jdbcurl'];
		dsUserId = credentials['username'];
        dsPassword = credentials['password'];
	}
});

//set up the proxy to the reporting service
var ersConnection = new callERS(reportingUri, reportingUserId, reportingPassword, bundleUri);
ersConnection.connect();

// Any request to application (other than for index) is handled with this routing call
app.use(function(req, res, next){

	if(req.path.indexOf("ers/v1") !== -1){
		ersConnection.execute(req , res);
	}
	else{
		next();
	}
});

// used to disconnect from reporting service when application is shutdown
process.on('SIGINT', function() {
	ersConnection.disconnect();
	console.log('Got SIGINT. Exiting server.');
})

var server = null;
if (process.env.VCAP_APP_HOST){
	server = require('http').createServer(app);
	server.listen(port,
                 process.env.VCAP_APP_HOST,
                 connected);
}else{
	server = require('https').createServer(options, app);
	server.listen(port,connected);
}

if ( wssConfigurator && server ){
	wssConfigurator( server );
}

require("cf-deployment-tracker-client").track();