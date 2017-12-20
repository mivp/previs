// require variables to be declared
'use strict';

var fs 			= require('fs');
var path        = require('path');
var exec 		= require('child_process').exec;
var execSync	= require('child_process').execSync;

var myutils 	= require('./node-utils');
var config		= require('./node-config').config; 
var dbmanager   = require('./node-mongodb');
var extract 	= require('extract-zip')

function processUpload(io, data) {
	
	var file = data.file;
	var filepath = config.tags_data_dir + file;
	var datatype = data.datatype;
	var uploadtype = data.uploadtype;
	
	if (uploadtype === 'local') {
		processUploadFile(io, data);
	}
	else if (uploadtype === 'link') {
		// download file and then process
	}
	else {
		console.log ('Invalid upload type');
		myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Invalid upload type'});
		return;
	}
}

function processUploadFile(io, data) {
	var file = data.file;
	var filepath = config.tags_data_dir + file;
	var fileext =file.split('.').pop().toLowerCase();
	var datatype = data.datatype;
	
	// check zip file
	if (datatype === 'volume' || datatype === 'mesh') {
		myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Checking zipfile...'});
		var cmd_test = 'cd ' + config.scripts_dir + ' && python checkzip.py -f ' + filepath;
		try
		{
			console.log(cmd_test);
			var out = execSync(cmd_test).toString();
			console.log(out);
			if(datatype === 'mesh' && out.indexOf("Zip file contains meshes") == -1) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Zip file has no obj file'});
				return;
			}
			if(datatype === 'volume' && out.indexOf("Zip file contains TIFF files") == -1) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Zip file has no TIFF file'});
				return;
			}
			if(out.indexOf("Zip file contains meshes") != -1 && out.indexOf("Zip file contains TIFF files") != -1) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Zip file contains both images and meshes - not yet supported'});
				return;
			}
		}
		catch(err)
		{
			console.log("Error!: " + err.message);
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Checking zip file type failed!', detail: err.message});
			return;
		}
	}
	
	dbmanager.createNewTag(function(err, tag_str) {
		if(err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot create tag'});
			return;
		}
		data.tag = tag_str;
		data.tagdir = config.tags_data_dir + tag_str;
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
		});
	});
}

// process zip volume file
function processUploadFile_Volumes(io, data) {
	console.log('processUploadFile_Volumes');
	console.log(data);
	
	var inputfile = data.inputfile;
	var cmd = 'cd ' + config.scripts_dir + ' && python tiff2tga.py -i ' + inputfile + ' -o ' + data.tagdir;
	console.log(cmd);
	myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Converting tiff to tga...'})
	exec(cmd, function(err, stdout, stderr) 
    {
    	console.log(stdout);
    	console.log(stderr);
    	if(err)
		{
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot convert tiff to tga', detail: stderr});
			return;
		}
		myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Converting tga to xrw...'});
		convertToXRW(io, data);
    });
}

// DW
function processUploadFile_Meshes(io, data) {
	console.log('processUploadFile_Meshes');
	console.log(data);
	
	myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Processing tree of meshes...'});
	var filename = data.file;
	var inputfile = data.inputfile;
	var inputfilename = data.inputfilename;

	var cmd = 'cd ' + config.scripts_dir + ' && python processtree.py -f ' + inputfile + ' -o ' + data.tagdir + ' -n ' + inputfilename + '_result';
	console.log(cmd);
	exec(cmd, function(err, stdout, stderr) 
    {
    	console.log(stdout);
    	console.log(stderr);
    	if(err)
		{
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Processing the meshes archive failed!', detail: stderr});
			return;
		}
	    myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Files unpacked, all groups processed..'})
		sendViewDataToClient_Meshes(io, data);
    });
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
			        if (ext === 'las' || ext === 'laz' || ext === 'ptx' || ext === 'ply') {
			        	convertPointcloud(io, data, out_dir + '/' + items[i]);
			        	found = true;
			        	break;
			        }
			    }
			    if (found === false) {
			    	myutils.packAndSend(io, 'processupload', {status: 'error', result: 'Cannot find pointcloud file', detail: err});
					return;
			    }
			});
		})
	}
	else {
		convertPointcloud(io, data, data.inputfile);
	}
}

function convertToXRW(io, data) {
	
	var inputfilename = data.inputfilename;
	var tga_dir = data.tagdir + '/' + inputfilename + '_tga';
	var result_dir = data.tagdir + '/' + inputfilename + '_result';
	
	var cmd = 'cd ' + config.scripts_dir + ' && tgastack2xrw -f ' + tga_dir + '/%04d.tga -o ' + result_dir + '/vol.xrw && rm -rf ' + tga_dir;
	console.log(cmd);

	exec(cmd, function(err, stdout, stderr) 
    {
    	console.log(stdout);
    	console.log(stderr);
    	if(err)
		{
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot convert tga to xwr', detail: stderr});
			return;
		}
		myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Converting xrw to png...'});
		convertToPNG(io, data);
    });
}

function convertToPNG(io, data) {
	
	var inputfilename = data.inputfilename;
	var result_dir = data.tagdir + '/' + inputfilename + '_result';
	var xrwfile = result_dir + '/vol.xrw';
	
	var cmd = 'xrwinfo ' + xrwfile + ' | grep dimensions';
	console.log(cmd);
	
	exec(cmd, function(err, stdout, stderr) {
		if (err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_run_xrwinfo'});
			return;
		} 
    	
    	stdout = myutils.trim(stdout).trim();
    	var res = stdout.split(" ");
    	var vol_res = [parseInt(res[2]), parseInt(res[3]), parseInt(res[4])];
    	var max_val = Math.max.apply(Math, vol_res);
    	var resize_factor = 1;
    	if(max_val > 2048)
    		resize_factor = 4;
    	else if (max_val > 1024)
    		resize_factor = 2;
    	data.resize_factor = resize_factor;
    	data.vol_res_full = vol_res;
    	data.vol_res_web = [ Math.floor(vol_res[0]/resize_factor), Math.floor(vol_res[1]/resize_factor), Math.floor(vol_res[2]/resize_factor)];
    	console.log(data);
    
    	var cmd = 'cd ' + config.scripts_dir + ' && xrw2pngmos -f ' + result_dir + '/vol.xrw -o ' + result_dir + '/vol_web.png -s ' 
    		 	+ resize_factor + ' ' + resize_factor + ' ' + resize_factor  
			  	+ ' && convert ' + result_dir + '/vol_web.png -thumbnail 256 ' + result_dir + '/vol_web_thumb.png';
		console.log(cmd);
	
		exec(cmd, function(err, stdout, stderr) {
	    	console.log(stdout);
	    	console.log(stderr);
	    	if(err)
			{
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_convert_to_png', detail: stderr});
				return;
			}
			myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Preparing json file...'});
			sendViewDataToClient(io, data);
	    });
	});
}

function sendViewDataToClient(io, data) {
	
	var basename = data.inputfilename;
	var jsonfile_full = data.tagdir + '/' + basename + '_result/vol_full.json';
	var jsonfile_web = data.tagdir + '/'  + basename + '_result/vol_web.json';
	var jsontemp = path.dirname(process.mainModule.filename) + '/src/template.json';

	var tag_url = 'data/tags/' + data.tag + '/';
	var jsonurl_full = tag_url + basename + '_result/vol_full.json';
	var jsonurl_web = tag_url + basename + '_result/vol_web.json';
	var thumburl = tag_url + basename + '_result/vol_web_thumb.png';
	var pngurl = tag_url + basename + '_result/vol_web.png';
	var xrwurl = tag_url + basename + '_result/vol.xrw';

	fs.readFile(jsontemp, 'utf8', function (err, jsondata) {
		if (err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_json'});
			return;
		} 
		var obj_full = JSON.parse(jsondata);
		var obj_web = JSON.parse(jsondata);
		obj_full.objects[0].volume.url = 'none'; //'data/local/' + basename + '_result/vol_web.png';
    	obj_full.objects[0].volume.res = data.vol_res_full;
    	
    	obj_web.objects[0].volume.url = tag_url + basename + '_result/vol_web.png';
    	obj_web.objects[0].volume.res = data.vol_res_web;

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
				tag_json.type='volume'
				tag_json.source='localupload';
				tag_json.date=Date.now();
				tag_json.data = data.tagdir + '/' + data.inputfilename + '.' + data.inputfileext;
					
				var volumes = [];
				var volume = {};
				volume.data_dir='data/local/' + basename + '_result';
				volume.json=jsonurl_full;
				volume.json_web=jsonurl_web;
				volume.thumb=thumburl;
				volume.png=pngurl;
				volume.xrw=xrwurl;
				volume.res=obj_full.objects[0].volume.res;
				volume.res_web=obj_web.objects[0].volume.res;
				volumes.push(volume);
				tag_json.volumes=volumes;
				
				dbmanager.insertNewTag(tag_json, function(err, res) {
					if (err) {
						io.emit('processupload', {status: 'error', result: 'cannot_generate_tag_json'});
						//throw err;
						return;
					} 
					myutils.packAndSend(io, 'processupload', {status: 'done', result: tag_json});
				});
			});
	    });		
	});
}

function sendViewDataToClient_Meshes(io, data) {
	
	var basename = data.inputfilename;
	var jsontemp = path.dirname(process.mainModule.filename) + '/src/template.json';
	var jsonfile = data.tagdir + '/' + basename + '_result/mesh.json';

	var tag_url = 'data/tags/' + data.tag + '/';
	var jsonurl = tag_url + basename + '_result/mesh.json';
	var initurl = tag_url + basename + '_result/init.script';
	var thumburl = tag_url + basename + '_result/vol_web_thumb.png';
	var pngurl = tag_url + basename + '_result/vol_web.png';
	var xrwurl = tag_url + basename + '_result/vol.xrw';
	
	var processedzip = basename + '_processed.zip';
	var zipurl = tag_url + processedzip;
	

	fs.readFile(jsontemp, 'utf8', function (err, jsondata) {
		if (err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_json'});
			console.log(err);
			return;
		} 
		var obj = JSON.parse(jsondata);
		obj.objects[0].volume.url = tag_url + basename + '_result/vol.png';

		// normally, we would get the properties of the volume here, but this is for meshes!
		// get any additional mesh properties if needed (e.g. mesh count, face/vertex count, group count, bounding box etc.)
		obj.objects[0].volume.res = [0, 0, 0];

		//write
		fs.writeFile( jsonfile, JSON.stringify(obj, null, 4), function(err) {
			if (err) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_json'});
				console.log(err);
				return;
			} 
			
			// write to database
			var tag_json = {};
			tag_json.tag=data.tag;
			tag_json.type='mesh'
			tag_json.source='localupload';
			tag_json.date=Date.now();
			tag_json.data = data.file;

			var volumes = [];
			var volume = {};
			volume.data_dir=tag_url + basename + '_result';
			volume.json=jsonurl;
			volume.initscr = initurl;
			volume.thumb=thumburl;
			volume.png=pngurl;
			volume.xrw=xrwurl;
			volume.zip=zipurl;
			volume.res=obj.objects[0].volume.res;
			volumes.push(volume);
			tag_json.volumes=volumes;
			
			dbmanager.insertNewTag(tag_json, function(err, res) {
				if (err) {
					myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_tag_json'});
					//throw err;
					return;
				} 
				myutils.packAndSend(io, 'processupload', {status: 'done', result: tag_json});
			});

	    });		
	});
}


function convertPointcloud(io, data, in_file) {
	var basename = data.inputfilename;
	var out_dir = data.tagdir + '/' + basename + '_result';
	var tag_url = 'data/tags/' + data.tag + '/';
	
	var cmd = 'cd ' + config.potree_converter_dir + ' && ./PotreeConverter -o ' + out_dir + ' -i ' + in_file + ' -p potree';
	console.log(cmd);
	myutils.packAndSend(io, 'processupload', {status: 'working', result: 'Converting pointcloud...(it takes long time to process big data e.g. ~10min for 100k points)'});
	exec(cmd, function(err, stdout, stderr) {
    	console.log(stdout);
    	console.log(stderr);
    	if(err) {
			myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_convert_pointcloud', detail: stderr});
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

		//save to database
		var tag_json = {};
		tag_json.tag=data.tag;
		tag_json.type='point'
		tag_json.source='localupload';
		tag_json.date=Date.now();
		tag_json.data = tag_url + data.inputfilename + '.' + data.inputfileext;
			
		var potree_url = tag_url + basename + '_result/potree.html';
		var volumes = [];
		var volume = {};
		volume.data_dir = tag_url + basename + '_result';
		volume.potree_url = potree_url;
		volume.res = [numpoints];
		volumes.push(volume);
		tag_json.volumes=volumes;
		
		dbmanager.insertNewTag(tag_json, function(err, res) {
			if (err) {
				myutils.packAndSend(io, 'processupload', {status: 'error', result: 'cannot_generate_tag_json'});
				//throw err;
				return;
			} 
			myutils.packAndSend(io, 'processupload', {status: 'done', result: tag_json});
		});
    });
}

// EXPORT
module.exports.processUpload = processUpload;