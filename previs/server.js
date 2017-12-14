// require variables to be declared
'use strict';

// node: built-in
var http 		  = require('http');
var socketio 	  = require('socket.io');
var express 	  = require('express');

var path          = require('path');
var exec          = require('child_process').exec;
var formidable 	  = require('formidable');
var bodyParser 	  = require('body-parser');
var fs 			  = require('fs'); 

var config 		  = require('./src/node-config').config;
var myadmin 	  = require('./src/node-admin');
var mylocalupload = require('./src/node-localobjupload');
var preview 	  = require('./src/node-preview');


// ===== INITIALISATION ======
var app = express();
var server = http.createServer(app);
var io = socketio.listen(server);

app.use(express.static(path.resolve(__dirname, config.public_dir)));
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

server.listen(process.env.PORT || config.port, process.env.IP || "0.0.0.0", function(){
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

	  	form.uploadDir = config.local_data_dir;
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

//! Make model tok file
/*
app.get('/rest/makeSurferTok', function (req, res) {
	  var cid = req.query.cid;
	  var sid = req.query.sid;
	  console.log(cid);

	  var cmd = 'cd ' + config.scripts_dir + ' && python make_token_file.py ';
    console.log(cmd);
    exec(cmd, function(err, stdout, stderr) 
         {
    	       console.log(stdout);
    	       console.log(stderr);
    	       if(err)
		         {
			           console.log(err);
			           res.setHeader('Content-Type', 'application/json');
    		         res.send(JSON.stringify({ error: "Cannot get members" }, null, 4));
			           return;
		         }
		         res.setHeader('Content-Type', 'application/json');
    	       res.send(stdout);
         });
});
*/

// ===== SOCKET IO ===========
io.on('connection', function (socket) {
	console.log("A client connected!");

	socket.on('disconnect', function(){
    	console.log('user disconnected');
  	});

    //local upload
  	socket.on('processuploadfile', function (data) {
  		console.log(data);
  		mylocalupload.processUploadFile(io, data);
  	});
  	
  	socket.on('processtag', function(data) {
		console.log(data);
		preview.processTag(io, data);
	});
	
	socket.on('savedatajson', function(data) {
		console.log(data);
		saveDataJson(io, data);
	});

	socket.on('admingettags', function(data) {
		console.log(data);
		myadmin.getTags(io, data);
	});
	
	socket.on('admindeletetags', function(data) {
		console.log(data);
		myadmin.deleteTags(io, data);
	});

	socket.on('saveparams', function(data) {
		console.log(data);
		saveParams(io, data);
	});
});

function saveDataJson(io, data) {
	var filename = config.public_dir + "/" + data.file;
	//write
	fs.writeFile( filename, data.json, function(err) {
		if (err) {
			console.log(err);
			io.emit('savedatajson', {status: 'error', result: 'cannot_save_json', detail: err });
			//throw err;
			return;
		} 
		io.emit('savedatajson', { status: 'done', result: data.file });
	});
}

function saveParams(io, data)
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
			io.emit('saveparams', { status: 'error' });

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