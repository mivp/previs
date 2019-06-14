// require variables to be declared
'use strict';

var fs 			= require('fs');
var path        = require('path');
var exec 		= require('child_process').exec;
var execSync	= require('child_process').execSync;

var myutils 	= require('./node-utils');
var config		= require('./node-config').config; 
var extract 	= require('extract-zip');
var crypto 		= require('crypto');

function processUpload(io, data) {
	
	console.log('processUpload', data);
	var file = data.file;
	//var filepath = config.tags_data_dir + file;
	//var datatype = data.datatype;
	var uploadtype = data.uploadtype;
	
	if (uploadtype === 'local') {
		processUploadFile(io, data);
	}
	else if (uploadtype === 'link') {
		processUploadLink(io, data);
	}
	else if (uploadtype === 'mytardis') {
		processUploadMytardis(io, data);
	}
	else {
		console.log ('Invalid upload type');
		myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Invalid upload type'});
		return;
	}
}

function processUploadLink(io, data) {
	var url = data.url;
	
	var id = '';
	var service = '';
	
	if (url.indexOf("google") !== -1) {
		id = myutils.extractGoogleId(url);
		service = "google";
	}
	
	if (id === '' || id.length < 25) {
		myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Fail to extract id'});
		return;
	}
	
	var destfile = config.tags_data_dir + id + '.' + data.ext;
	var cmd = 'cd ' + config.scripts_dir + ' && python downloadlink.py ' + service + ' ' + id + ' ' + destfile;
	console.log(cmd);
	myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Downloading file from shared link...'})
	exec(cmd, function(err, stdout, stderr) 
    {
    	console.log(stdout);
    	console.log(stderr);
    	if(err)
		{
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot download file from shared link', detail: stderr});
			myutils.sendEmail('fail', data, {status: 'error', result: 'cannot download file from shared link', detail: stderr});
			return;
		}
		//check file exist
		if(myutils.fileExists(destfile) === false) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot download file from shared link', detail: stderr});
			myutils.sendEmail('fail', data, {status: 'error', result: 'cannot download file from shared link', detail: stderr});
			return;
		}
		
		myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Processing downloaded file...'});
		data.file = id + '.' + data.ext;
		processUploadFile(io, data);
    });
}

function processUploadMytardis(io, data) {

	var host = data.auth.host;
	var apikey = data.auth.apiKey;
	var fileid = data.fileid;
	var filename = data.filename;
	var destfile =  config.tags_data_dir + fileid + '_' + filename;
	
	// download file
	var url = 'https://' + host + '/api/v1/dataset_file/' + fileid + '/download/';
	console.log(url);
	myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Downloading file from mytardis...'})
	myutils.downloadFileHttps(url, apikey, destfile, function(err) {
		if(err) {
			console.log(err);
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Fail to download file ' + fileid});
			myutils.sendEmail('fail', data, {status: 'error', result: 'Fail to download file ' + fileid});
			return;
		}

	   //check file exist
		if(myutils.fileExists(destfile) === false) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot download file from mytardis'});
			myutils.sendEmail('fail', data, {status: 'error', result: 'cannot download file from mytardis'});
			return;
		}
		
		myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Processing downloaded file...'});
		data.file = fileid + '_' + filename;
		processUploadFile(io, data);
	});
}

function processUploadFile(io, data) {
	var file = data.file;
	var filepath = config.tags_data_dir + file;
	var fileext = file.split('.').pop().toLowerCase();
	var datatype = data.datatype;
	
	if (fileext === "zip") {
		// check zip file
		myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Checking zipfile...'});
		var cmd_test = 'cd ' + config.scripts_dir + ' && python checkzip.py -f ' + filepath + " -t " + datatype;
		
		try {
			console.log(cmd_test);
			var out = execSync(cmd_test).toString();
			out = JSON.parse(out)
			console.log(out);
			if (!out.match) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Zip file contents do not match type'});
				myutils.sendEmail('fail', data, {status: 'error', result: 'Zip file contents do not match type'});
				return;
			}
		}
		catch(err) {
			console.log("Error!: " + err.message);
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Checking zip file type failed!', detail: err.message});
			myutils.sendEmail('fail', data, {status: 'error', result: 'Checking zip file type failed!', detail: err.message});
			return;
		}
	}
	
	data.db.createNewTag(function(err, tag_str) {
		if(err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot create tag'});
			return;
		}
		data.tag = tag_str;
		data.dir = tag_str + '_' + crypto.randomBytes(3).toString('hex');
		data.tagdir = config.tags_data_dir + data.dir;
		data.inputfile = data.tagdir + '/' + datatype + '.' + fileext;
		data.inputfilename = datatype;
		data.inputfileext = fileext;
		// create tag dir
		myutils.createDirSync(data.tagdir);
		
		myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Renaming file'});
		myutils.moveFile(filepath, data.inputfile, function(err) {
			if(err) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot move file to tag dir'});
				return;
			}
			if(datatype === 'volume') {
				processUploadFile_Volumes(io, data);
			}
			else if (datatype === 'mesh') {
				processUploadFile_Meshes(io, data);
			}
			else if (datatype === 'point') {
				processUploadFile_Points(io, data);
			}
			else if (datatype === 'image') {
				processUploadFile_Images(io, data);
			}
			else if (datatype === 'photogrammetry') {
				processUploadFile_Photogrammetry(io, data);
			}
			else {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'unsupported data type'});
			}
		});
	});
}

// process zip volume file
function processUploadFile_Volumes(io, data) {
	console.log('processUploadFile_Volumes');
	console.log(data);
	
	var inputfile = data.inputfile;
	var settings = data.settings; // vol voxel size x, y, z, channel, timestep
	var out_dir = data.tagdir + '/volume_result';
	var cmd = 'cd ' + config.scripts_dir + ' && python processvolume.py -i ' + inputfile + ' -o ' + out_dir + ' -c ' + settings.channel + ' -t ' + settings.time;
	console.log(cmd);
	myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Converting image stack to xrw...'})
	exec(cmd, function(err, stdout, stderr) 
    {
    	console.log(stdout);
    	console.log(stderr);
    	if(err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot convert image stack to xrw and mosaic png', detail: stderr});
			myutils.sendEmail('fail', data, {status: 'error', result: 'cannot convert image stack to xrw and mosaic png', detail: stderr});
			return;
		}
		// parse output to get size
		var info = JSON.parse(stdout.trim());

		data.vol_res_full = info.size;
    	data.vol_res_web = info.newsize;
    	//calculate scale
    	var settings = data.settings;
    	var xref_full = data.vol_res_full[0]*settings.voxelSizeX;
    	data.vol_scale_full = [1, data.vol_res_full[1]*settings.voxelSizeY/xref_full, data.vol_res_full[2]*settings.voxelSizeZ/xref_full];
    	var xref_web = data.vol_res_web[0]*settings.voxelSizeX;
    	data.vol_scale_web = [1, data.vol_res_web[1]*settings.voxelSizeY/xref_web, data.vol_res_web[2]*settings.voxelSizeZ/xref_web];
    	
		myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Preparing json file...'});
		sendViewDataToClient(io, data);
    });
}

// DW
function processUploadFile_Meshes(io, data) {
	console.log('processUploadFile_Meshes');
	console.log(data);
	
	myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Processing meshes...'});
	var inputfile = data.inputfile;
	
	var out_dir = data.tagdir + '/mesh_result';
	var cmd = 'cd ' + config.scripts_dir + ' && python processmesh.py -i ' + inputfile + ' -o ' + out_dir;
	console.log(cmd);
	exec(cmd, function(err, stdout, stderr) 
    {
    	console.log(stdout);
    	console.log(stderr);
    	if(err)
		{
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Processing the meshes archive failed!', detail: stderr});
			myutils.sendEmail('fail', data, {status: 'error', result: 'Processing the meshes archive failed!', detail: stderr});
			return;
		}
		data.numobjects = JSON.parse(stdout);
	    myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Files unpacked, all groups processed..'})
		sendViewDataToClient_Meshes(io, data);
    });
}

//NH
// process zip photogrammetry file @AH
function processUploadFile_Photogrammetry(io, data) {
	console.log('processUploadFile_Photogrammetry');
	console.log(data);
	
	var inputfile = data.inputfile;
	var settings = data.settings; // vol voxel size x, y, z, channel, timestep
	var out_dir = data.tagdir + '/photogrammetry_result';
	var cmd = 'cd ' + config.scripts_dir + ' && python processphotogrammetry.py -i ' + inputfile + ' -o ' + out_dir;
	console.log(cmd);
	myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Processing photogrammetry images...'})
	exec(cmd, function(err, stdout, stderr) 
    {
    	console.log(stdout);
    	console.log(stderr);
    	if(err)
		{
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Processing images failed', detail: stderr});
			myutils.sendEmail('fail', data, {status: 'error', result: 'Processing photogrammetry images failed.', detail: stderr});
			return;
		}
		myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Processing photogrammetry...You will be notified via email when finished'+data.tag});
		//myutils.packAndSend(io, 'processupload', {status: 'done', result: tag_json});
    });
    //myutils.packAndSend(io, 'processupload', {status: 'done', result: "unknown"});
}

function processUploadFile_Points(io, data)
{
	var filename = data.inputfilename;
	var fileext = data.inputfileext;
	if (fileext === 'zip') {
		var out_dir = data.tagdir + '/' + filename + '_result';
		extract(data.inputfile, { dir: out_dir }, function (err) {
			if(err) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot unzip file', detail: err});
				return;
			}
			fs.unlinkSync(data.inputfile);
			fs.readdir(out_dir, function(err, items) {
			    console.log(items);
			    var found = false;
			    for (var i=0; i<items.length; i++) {
			        var ext = items[i].split('.').pop().toLowerCase();
			        if (ext === 'las' || ext === 'laz' || ext === 'ptx' || ext === 'ply' || ext === 'xyz' || ext === 'txt') {
			        	convertPointcloud(io, data, out_dir + '/' + items[i]);
			        	found = true;
			        	break;
			        }
			    }
			    if (found === false) {
			    	myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Cannot find pointcloud file', detail: err});
			    	myutils.sendEmail('fail', data, {status: 'error', result: 'Cannot find pointcloud file', detail: err});
					return;
			    }
			});
		})
	}
	else {
		convertPointcloud(io, data, data.inputfile);
	}
}

// process images file
function processUploadFile_Images(io, data) {
	console.log('processUploadFile_Images');
	console.log(data);
	
	var inputfile = data.inputfile;
	var out_dir = data.tagdir + '/image_result';
	var cmd = 'cd ' + config.scripts_dir + ' && python processimage.py -i ' + inputfile + ' -o ' + out_dir;
	console.log(cmd);
	myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Converting images...'})
	exec(cmd, function(err, stdout, stderr) {
    	console.log(stdout);
    	console.log(stderr);
    	if(err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Failed to convert images', detail: stderr});
			myutils.sendEmail('fail', data, {status: 'error', result: 'Failed to convert images', detail: stderr});
			return;
		}
		
		var outputimages = JSON.parse(stdout);
		
		//save to database
		//var tag_url = 'data/tags/' + data.dir + '/';
		var tag_json = {};
		tag_json.tag=data.tag;
		tag_json.dir=data.dir;
		tag_json.type=data.datatype;
		tag_json.source=data.uploadtype;
		tag_json.date=Date.now();
		//tag_json.data = tag_url + data.inputfilename + data.inputfileext;
		tag_json.processedData = 'data/tags/' + data.dir + '/image_processed.zip';
		tag_json.userId = data.userDetails.uid;
		tag_json.userEmail = data.userDetails.email;
			
		var volumes = [];
		var volume = {};
		//volume.data_dir = tag_url + 'image_result';
		volume.subdir = 'image_result';
		volume.images = outputimages;
		volume.res = [outputimages.length];
		volumes.push(volume);
		tag_json.volumes=volumes;
		
		data.db.insertNewTag(tag_json, function(err, res) {
			if (err) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Cannot insert new tag'});
				return;
			} 
			myutils.packAndSend(io, 'processupload', {status: 'done', result: tag_json});
			// zip pointcloids folder
			myutils.zipDirectory(out_dir, '', data.tagdir + '/image_processed.zip');
			// email
			myutils.sendEmail('ready', data);
		});
		
    });
}


function sendViewDataToClient(io, data) {
	
	var basename = data.inputfilename;
	var jsonfile_full = data.tagdir + '/' + basename + '_result/vol_full.json';
	var jsonfile_web = data.tagdir + '/'  + basename + '_result/vol_web.json';
	var jsontemp = path.dirname(process.mainModule.filename) + '/src/template.json';

	var tag_url = 'data/tags/' + data.dir + '/';
	//var jsonurl_full = tag_url + basename + '_result/vol_full.json';
	//var jsonurl_web = tag_url + basename + '_result/vol_web.json';
	//var thumburl = tag_url + basename + '_result/vol_web_thumb.png';
	//var pngurl = tag_url + basename + '_result/vol_web.png';
	//var xrwurl = tag_url + basename + '_result/vol.xrw';

	fs.readFile(jsontemp, 'utf8', function (err, jsondata) {
		if (err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_json'});
			return;
		} 
		var obj_full = JSON.parse(jsondata);
		var obj_web = JSON.parse(jsondata);
		obj_full.objects[0].volume.url = 'none'; //'data/local/' + basename + '_result/vol_web.png';
    	obj_full.objects[0].volume.res = data.vol_res_full;
    	obj_full.objects[0].volume.scale = data.vol_scale_full;
    	
    	obj_web.objects[0].volume.url = tag_url + basename + '_result/vol_web.png';
    	obj_web.objects[0].volume.res = data.vol_res_web;
    	obj_web.objects[0].volume.scale = data.vol_scale_web;

    	//write json first
		fs.writeFile( jsonfile_full, JSON.stringify(obj_full, null, 4), function(err) {
			if (err) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_json_full'});
				return;
			} 
			
			//write json file for web
			fs.writeFile( jsonfile_web, JSON.stringify(obj_web, null, 4), function(err) {
				if (err) {
					myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_json_full'});
					return;
				} 
				
				// save to database
				var tag_json = {};
				tag_json.tag=data.tag;
				tag_json.dir=data.dir;
				tag_json.type='volume'
				tag_json.source='localupload';
				tag_json.date=Date.now();
				//tag_json.data = data.tagdir + '/' + data.inputfilename + '.' + data.inputfileext;
				tag_json.userId = data.userDetails.uid;
				tag_json.userEmail = data.userDetails.email;
					
				var volumes = [];
				var volume = {};
				//volume.data_dir='data/local/' + basename + '_result';
				//volume.json=jsonurl_full;
				//volume.json_web=jsonurl_web;
				//volume.thumb=thumburl;
				//volume.png=pngurl;
				//volume.xrw=xrwurl;
				volume.subdir='volume_result';
				volume.res=obj_full.objects[0].volume.res;
				volume.res_web=obj_web.objects[0].volume.res;
				volumes.push(volume);
				tag_json.volumes=volumes;
				
				data.db.insertNewTag(tag_json, function(err, res) {
					if (err) {
						myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_tag_json'});
						return;
					} 
					myutils.packAndSend(io, 'processupload', {status: 'done', result: tag_json});
				
					// email
					myutils.sendEmail('ready', data);
				});
			});
	    });		
	});
}

function sendViewDataToClient_Meshes(io, data) {
	
	var basename = data.inputfilename;

	var tag_url = 'data/tags/' + data.dir + '/';
	//var jsonurl = tag_url + basename + '_result/mesh.json';
	//var initurl = tag_url + basename + '_result/init.script';

	// write to database
	var tag_json = {};
	tag_json.tag=data.tag;
	tag_json.dir=data.dir;
	tag_json.type='mesh'
	tag_json.source= data.uploadtype;
	tag_json.date=Date.now();
	//tag_json.data = data.file;
	tag_json.processedData = 'data/tags/' + data.dir + '/mesh_processed.zip';
	tag_json.userId = data.userDetails.uid;
	tag_json.userEmail = data.userDetails.email;

	var volumes = [];
	var volume = {};
	//volume.data_dir=tag_url + basename + '_result';
	//volume.json=jsonurl;
	//volume.initscr = initurl;
	volume.subdir = 'mesh_result';
	volume.res = data.numobjects; //[0, 0, 0];
	volumes.push(volume);
	tag_json.volumes=volumes;
	
	data.db.insertNewTag(tag_json, function(err, res) {
		if (err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_tag_json'});
			return;
		} 
		myutils.packAndSend(io, 'processupload', {status: 'done', result: tag_json});
		
		// clean up and zip mesh folder
		myutils.zipDirectory(data.tagdir + '/mesh_result', '', data.tagdir + '/mesh_processed.zip');
		if (myutils.fileExists(data.inputfile)) {
			fs.unlink(data.inputfile);
		}
		
		// email
		myutils.sendEmail('ready', data);
	});
}


function convertPointcloud(io, data, in_file) {
	var basename = data.inputfilename;
	var fileext = in_file.split('.').pop().toLowerCase();;
	var out_dir = data.tagdir + '/' + basename + '_result';
	var convert_out_dir = out_dir + '/pointclouds/potree'; // to be compatible with previous converter having output html page
	var tag_url = 'data/tags/' + data.dir + '/';
	
	var cmd = '';
	if (fileext === 'xyz' || fileext === 'txt') {
		cmd = 'cd ' + config.potree_converter_dir + ' && ./PotreeConverter ' + in_file + ' -o ' + convert_out_dir + ' -f xyzrgb';
	} else {
		cmd = 'cd ' + config.potree_converter_dir + ' && ./PotreeConverter ' + in_file + ' -o ' + convert_out_dir;
	} 
	console.log(cmd);
	myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Converting pointcloud...(it takes long time to process big data e.g. ~10min for 100k points)'});
	exec(cmd, function(err, stdout, stderr) {
    	console.log(stdout);
    	console.log(stderr);
    	if(err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_convert_pointcloud', detail: stderr});
			myutils.sendEmail('fail', data, {status: 'error', result: 'cannot_convert_pointcloud', detail: stderr});
			return;
		}
		
		saveDefaultPotreeSetting(data, function(err){
			if(err) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: "cannot_save_default_json"});
				return;
			}
			
			stdout = myutils.trim(stdout).trim();
			stdout = stdout.split(' ');
			var numpoints = '0';
			for(var i=1; i < stdout.length; i++) {
				var item = stdout[i].trim();
				if(item === 'points')
					numpoints = stdout[i-1];
			}
			console.log(numpoints);
			if(numpoints === '0') {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: "numpoints = 0; failed to convert pointcloud, please check data format"});
				myutils.sendEmail('fail', data, {status: 'error', result: "numpoints = 0; failed to convert pointcloud, please check data format"});
				return;
			}
	
			//save to database
			var tag_json = {};
			tag_json.tag=data.tag;
			tag_json.dir=data.dir;
			tag_json.type='point'
			tag_json.source='localupload';
			tag_json.date=Date.now();
			//tag_json.data = tag_url + data.inputfilename + data.inputfileext;
			tag_json.processedData = 'data/tags/' + data.dir + '/point_processed.zip';
			tag_json.userId = data.userDetails.uid;
			tag_json.userEmail = data.userDetails.email;
				
			var potree_url = tag_url + basename + '_result/potree.html';
			var volumes = [];
			var volume = {};
			//volume.data_dir = tag_url + basename + '_result';
			//volume.potree_url = potree_url;
			volume.subdir = 'point_result';
			volume.res = [numpoints];
			volumes.push(volume);
			tag_json.volumes=volumes;
			
			data.db.insertNewTag(tag_json, function(err, res) {
				if (err) {
					myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_tag_json'});
					//throw err;
					return;
				} 
				myutils.packAndSend(io, 'processupload', {status: 'done', result: tag_json});
				// zip pointcloids folder
				myutils.zipDirectory(out_dir + '/pointclouds/potree', 'potree', data.tagdir + '/point_processed.zip');
				// email
				myutils.sendEmail('ready', data);
			});
		});
    });
}

function saveDefaultPotreeSetting(data, callback) {
	var dir = data.dir;
	var destfile = config.tags_data_dir + dir + '/gigapoint.json';
	var jsonObj = {
		version: 2,
		dataDir: "potree",
		visiblePointTarget: 30000000,
		minNodePixelSize: 100,
		material: "rgb",
		pointScale: [0.05,0.01,1.0],
		pointSizeRange: [2, 600],
		sizeType: "adaptive",
		quality: "circle",
		elevationDirection: 2,
		elevationRange: [0, 1],
		filter: "none",
		filterEdl: [0.4, 1.4],
		numReadThread: 6,
		preloadToLevel: 5,
		maxNodeInMem: 100000,
		maxLoadSize: 200,
		cameraSpeed: 10,
		cameraUpdatePosOri: 1,
		cameraPosition: [0, 0, 0],
		cameraTarget: [0, 0, -2],
		cameraUp: [0, 0, 1]
	};
	var cloudfile = config.tags_data_dir + dir + "/point_result/pointclouds/potree/cloud.js";
	fs.readFile(cloudfile, 'utf8', function (err, data) {
	    if (err) {
	    	callback(err);
	    	return;
	    }
	    //console.log(data);
	    var obj = JSON.parse(data);
	    var tbb = obj.tightBoundingBox;
	    var center = [(tbb.ux+tbb.lx)/2, (tbb.uy+tbb.ly)/2, (tbb.uz+tbb.lz)/2];
	    var target = [center[0], center[1], center[2]-2];
	    jsonObj.cameraPosition = center;
	    jsonObj.cameraTarget = target;
	    
	    var json = JSON.stringify(jsonObj, null, 4);
		//console.log(json);
		fs.writeFile(destfile, json, 'utf8', function(err) {
			if (err) {
				callback(err);
				return;
			}
			callback(null);
		});
	});
}

// ==== for potree viewer ====
function savePotreeSettings(io, data) {
	var dir = data.Dir;
	var destfile = config.tags_data_dir + dir + '/gigapoint.json';
	if(data.Preset && data.Preset !== 'default') {
		destfile = config.tags_data_dir + dir + '/gigapoint_' + data.Preset + '.json';
	}
	if(myutils.fileExists(destfile)) {
		fs.unlinkSync(destfile);
	}
	//console.log(destfile);
	
	var range_min = Math.min(data.ElevRangeMin, data.ElevRangeMax);
	var range_max = Math.max(data.ElevRangeMin, data.ElevRangeMax);
	var jsonObj = {
		version: 2,
		dataDir: "potree",
		visiblePointTarget: 30000000,
		minNodePixelSize: 100,
		material: data.PointColorType.toLowerCase(),
		pointScale: [0.1,0.01,1.5],
		pointSizeRange: [2, 600],
		sizeType: data.PointSizing.toLowerCase(),
		quality: data.PointShape.toLowerCase(),
		elevationDirection: 1,
		elevationRange: [range_min, range_max],
		filter: data.EDL ? "edl" : "none",
		filterEdl: [data.EDLStrength, data.EDLRadius],
		numReadThread: 6,
		preloadToLevel: 5,
		maxNodeInMem: 100000,
		maxLoadSize: 200,
		cameraSpeed: 10,
		cameraUpdatePosOri: 1,
		cameraPosition: data.CamLocation,
		cameraTarget: data.CamTarget,
		cameraUp: [0, 0, 1],
		//for web only
		forWebOnly: {
			PointBudget: data.PointBudget,
			FOV: data.FOV,
			PointSize: data.PointSize
		}
	};
	
	var json = JSON.stringify(jsonObj, null, 4);
	//console.log(json);
	fs.writeFile(destfile, json, 'utf8', function(err) {
		if (err) {
			io.emit('savepotreesettings', {status: 'error', result: 'cannot_save_json_file'});
			return;
		}
		io.emit('savepotreesettings', {status: 'done', result: jsonObj});
	});
}

// for potree viewer
function loadPotreeSettings(io, data) {
	var dir = data.Dir;
	var preset = data.Preset;
	var jsonfile = config.tags_data_dir + dir + '/gigapoint.json';
	if(preset && preset !== 'default') {
		jsonfile = config.tags_data_dir + dir + '/gigapoint_' + preset + '.json';
	}
	fs.readFile(jsonfile, 'utf8', function (err, data) {
	    if (err) {
	    	io.emit('loadpotreesettings', {status: 'error', result: 'cannot_load_json_file'});
	    	return;
	    }
	    var obj = JSON.parse(data);
	    io.emit('loadpotreesettings', {status: 'done', result: obj});
	});
}

// EXPORT
module.exports.processUpload = processUpload;
module.exports.processUploadFile = processUploadFile;	//for REST upload using scripts 
module.exports.savePotreeSettings = savePotreeSettings;
module.exports.loadPotreeSettings = loadPotreeSettings;
