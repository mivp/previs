// require variables to be declared
'use strict';

// node: built-in
var http 		  = require('http');
var socketio 	  = require('socket.io');
var express 	  = require('express');
var cors		  = require('cors')

var path          = require('path');
var formidable 	  = require('formidable');
var bodyParser 	  = require('body-parser');
var fs 			  = require('fs');

var config 		  = require('./src/node-config').config;
var myadmin 	  = require('./src/node-admin');
var myupload	  = require('./src/node-upload');
var preview 	  = require('./src/node-preview');
var mytardis	  = require('./src/node-mytardis');

var FilebaseManager   = require('./src/node-firebase');
var fbmanager = new FilebaseManager();


// ===== INITIALISATION ======
var app = express();
app.use(cors());
var server = http.createServer(app);
var io = socketio.listen(server);

app.use(express.static(path.resolve(__dirname, config.public_dir)));
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

//server.listen(process.env.PORT || config.port, process.env.IP || "0.0.0.0", function(){
server.listen(process.env.PORT || config.port, process.env.IP || "127.0.0.1", function(){
	var addr = server.address();
  	console.log("previs server listening at", addr.address + ":" + addr.port);
});

// ===== REST SERVICES =======
// ===== LOCAL UPLOAD  =======
app.post('/localupload', function (req, res) {
	console.log('receive and process .zip file');

	var form = new formidable.IncomingForm(),
		files = [],
	  	fields = [];

	  	form.uploadDir = config.tags_data_dir;
	  	form.encoding = 'utf-8';
	  	form.multiples = false;
	  	form.keepExtensions = true;

	  	form
	  	.on('field', function(field, value) {
	    	console.log(field, value);
	    	fields.push([field, value]);
	  	})
	  	.on('file', function(field, file) {
	    	console.log(field);
	    	console.log(file.name);
	    	console.log(file.path);
	    	files.push([field, file]);
	  	})
	  	.on('error', function(err) {
    		console.log('An error has occured: \n' + err);
    		res.json({status: 'error', detail: err});
  		})
	  	.on('end', function() {
	    	console.log('-> upload done');
	    	var filebase = path.parse(files[0][1].path).base;
	    	res.json({status: 'done', file: filebase});
	    });

	form.parse(req);

	return;
});

app.post('/rest/adminlogin', function (req, res) {

	var user = req.body.user;
	var password = req.body.password;
	//console.log(user + ' ' + password);

	if(user != "admin" || password != "c4ve2016") {
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify({ status: "error", result: "Cannot run login" }, null, 4));
		return;
	}
	res.setHeader('Content-Type', 'application/json');
	res.send(JSON.stringify({ status: "success", result: "Can login" }, null, 4));
});

//url/info?tag=tag
app.get('/rest/info', function (req, res) {
	var tag = req.query.tag;
	console.log(tag);
	
	fbmanager.getTag(tag, function(err, info) { 
		console.log(info);
		if(err || !info) {
			console.log(err);
			res.setHeader('Content-Type', 'application/json');
    		res.send(JSON.stringify({ status: "error", result: "cannot get info" }, null, 4));
    		return;
		}
		res.setHeader('Content-Type', 'application/json');
		res.send(info);
	});
});

app.get('*', function(req, res) {
    res.redirect('/');
});

// ===== SOCKET IO ===========
io.on('connection', function (socket) {
	console.log("A client connected!");

	socket.on('disconnect', function(){
    	console.log('user disconnected');
  	});
  	
  	socket.on('message', function(msg) {
  		msg = JSON.parse(msg);
  		console.log(msg);
  		msg.data.db = fbmanager;
  		if(msg.data.userId === undefined) msg.data.userId = 'none';
  		if(msg.data.userEmail === undefined) msg.data.userEmail = 'none';
  		if(msg.action === 'processtag') {
  			preview.processTag(socket, msg.data);
  		}
  		else if(msg.action === 'admindeletetags') {
  			myadmin.deleteTags(socket, msg.data);
  		}
  		else if(msg.action === 'adminupdatetag') {
  			myadmin.updateTag(socket, msg.data);
  		}
  		else if (msg.action === 'processupload') {
  			myupload.processUpload(socket, msg.data);
  		}
  		else if (msg.action === 'processmytardis') {
  			mytardis.processMytardis(socket, msg.data);
  		}
  	});
  	
    // sharevol
	socket.on('savedatajson', function(data) {
		console.log(data);
		saveDataJson(socket, data);
	});

	// meshviewer
	socket.on('saveparams', function(data) {
		console.log(data);
		saveParams(socket, data);
	});
	
	// potree viewer
	socket.on('savepotreesettings', function(data) {
		console.log(data);
		myupload.savePotreeSettings(socket, data);
	});
	socket.on('loadpotreesettings', function(data) {
		console.log(data);
		myupload.loadPotreeSettings(socket, data);
	});
});

function saveDataJson(socket, data) {
	var filename = config.public_dir + "/" + data.file;
	//write
	fs.writeFile( filename, data.json, function(err) {
		if (err) {
			console.log(err);
			socket.emit('savedatajson', {status: 'error', result: 'cannot_save_json', detail: err });
			//throw err;
			return;
		}
		socket.emit('savedatajson', { status: 'done', result: data.file });
	});
}

function saveParams(socket, data)
{
	console.log("Received saveparams from JS");
	console.log(data);

	var filename = data.filename;

	fs.writeFile(config.public_dir + "/" + filename, data.params, function(err)
	{
		if(err)
		{
			console.log("Error: " + err);

			// send a message to the viewer
			socket.emit('saveparams', { status: 'error' });

			return;
		}

		console.log("Saved");
	});

	var scriptFilename = data.scriptFilename;

	fs.writeFile(config.public_dir + "/" + scriptFilename, data.script, function(err)
	{
		if(err)
		{
			console.log("Error: " + err);
			return;
		}

		console.log("Saved init script");
	});
}
