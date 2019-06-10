'use strict';

var fs 			= require('fs');
var path        = require('path');
var config		= require('./node-config').config; 
var myutils 	= require('./node-utils');

const winston   = require('winston');

// ===============================
function getTags(io, data) {

    var tags = [];
  
    data.db.getAllTags(function(err, rows) { 
        //console.log(err);
        //console.log(rows);
        if(err) {
            myutils.packAndSend(io, 'admingettags', {status: 'error', result: 'cannot_get_tags'});
            return;
        }
        for (var i=0, l=rows.length; i < l; i++) {
            
            var row = rows[i];
            var tag = row.tag;
    
            var t = {};
            t.tag = tag;
            t.type = row.type;
            t.source = row.source;
            var d = new Date(row.date);
            t.date = d.toString();
            t.size = row.volumes[0].res.toString();
            t.data = row.data;
            tags.push(t);
        }
        //console.log(tags);
        myutils.packAndSend(io, 'admingettags', {status: 'done', result: tags});
    });
}

var deleteFolderRecursive = function(dir) {
  if( fs.existsSync(dir) ) {
    fs.readdirSync(dir).forEach(function(file,index){
      var curDir = path.join(dir, file);
      if(fs.lstatSync(curDir).isDirectory()) { // recurse
        deleteFolderRecursive(curDir);
      } else { // delete file
        fs.unlinkSync(curDir);
      }
    });
    fs.rmdirSync(dir);
  }
};

function deleteTag(io, data, item) {
    var tag = item.tag;
    var dir = item.dir || tag;
    var userId = item.userId;
    data.db.getTag(tag, function(err, res){
        if (err) {
            myutils.packAndSend(io, 'admindeletetags', {status: 'error', result: err});
    		return;
    	} 
    	if(res === null) {
    	    myutils.packAndSend(io, 'admindeletetags', {status: 'error', result: 'tag not found'});
    		return;
    	}
    	if(res.userId !== userId) {
    	    myutils.packAndSend(io, 'admindeletetags', {status: 'error', result: 'userId not match'});
    		return;
    	}
    	//delete tag and data
    	var tag_dir = config.tags_data_dir + dir;
        winston.info('delete ' + tag_dir);
        deleteFolderRecursive(tag_dir);
        
        //delete tag in database
        data.db.deleteTag(tag, function(err) {
            if(err)
                myutils.packAndSend(io, 'admindeletetags', {status: 'error', result: data, detail: 'failed to delete tag'});
            else
                myutils.packAndSend(io, 'admindeletetags', {status: 'done', result: data});
        });
    });
}

// ===============================
function deleteTags(io, data) {
    for (var i=0, l=data.tags.length; i < l; i++) {
        var item =  data.tags[i];
        winston.info(item);
        deleteTag(io, data, item);
    }
}

function updateTag(io, data) {
    var tag = data.tag;
    var type = data.type || '';
    var updatedata = data.data;
    
    data.db.updateTag(tag, updatedata, function(err) {
        if (err) 
            myutils.packAndSend(io, 'adminupdatetag', {status: 'error', type: type, result: err});
    	else 
    	    myutils.packAndSend(io, 'adminupdatetag', {status: 'done', type: type, result: {tag: tag, data: updatedata}});
    });
}

module.exports.getTags = getTags;
module.exports.deleteTags = deleteTags;
module.exports.updateTag = updateTag;