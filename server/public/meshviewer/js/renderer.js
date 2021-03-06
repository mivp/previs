'use strict';

var PrevisMeshRenderer = (function () {

	var Validator = THREE.LoaderSupport.Validator;

	function PrevisMeshRenderer( elementToBindTo ) {
		this.renderer = null;
		this.canvas = elementToBindTo;
		this.aspectRatio = 1;
		this.recalcAspectRatio();

		this.loaded = false;
		this.scene = null;
		this.cameraDefaults = {
			posCamera: new THREE.Vector3( 0.0, 1.0, 5.0 ),
			posCameraTarget: new THREE.Vector3( 0, 0, 0 ),
			near: 0.1,
			far: 10000,
			fov: 45
		};
		this.camera = null;
		this.cameraTarget = this.cameraDefaults.posCameraTarget;

		this.clock = new THREE.Clock();
		this.controls = null;
		
		// data
		this.allGroups = new THREE.Group();
		this.bbox = null;
		this.defaultBgColour = [64,64,72];
		this.jsonOri = null;
		this.json = null;
		this.groups = [];
		this.numberOfModels;
		this.modelCount = 0;
		this.axis = null; //axes, grid
		this.maxModelSize = 1;
	}

	PrevisMeshRenderer.prototype.initGL = function () {
		this.renderer = new THREE.WebGLRenderer( {
			canvas: this.canvas,
			antialias: true,
			autoClear: true
		} );
		this.renderer.setClearColor( this.defaultBgColour );

		this.scene = new THREE.Scene();

		this.camera = new THREE.PerspectiveCamera( this.cameraDefaults.fov, this.aspectRatio, this.cameraDefaults.near, this.cameraDefaults.far );
		this.resetCamera();
		this.controls = new THREE.TrackballControls( this.camera, this.renderer.domElement );
		
		//var ambientLight = new THREE.AmbientLight( 0x808088 );
		//var directionalLight1 = new THREE.DirectionalLight( 0xC0C090 );
		//var directionalLight2 = new THREE.DirectionalLight( 0xC0C090 );
		var ambientLight = new THREE.AmbientLight( 0xffffff );
		var directionalLight1 = new THREE.DirectionalLight( 0xffffff );
		var directionalLight2 = new THREE.DirectionalLight( 0xffffff );

		directionalLight1.position.set( -100, -50, 100 );
		directionalLight2.position.set( 100, 50, -100 );

		this.scene.add( directionalLight1 );
		this.scene.add( directionalLight2 );
		this.scene.add( ambientLight );
		
		//data
		this.scene.add(this.allGroups);
		
		//var camLight = new THREE.PointLight(0xfff0f8, 1);
		//this.camera.add(camLight);
	};
	
	PrevisMeshRenderer.prototype.loadJsonConfig = function (preset, cb) {
		showMessage('Load json configuration from server...', true);
		var scope = this;
	    // load the json file, as a test..
	    var xmlreq = new XMLHttpRequest();
	    xmlreq.onreadystatechange = function()
	    {
	        if(this.readyState == 4 && this.status == 200)
	        {
	            var jsonObj = JSON.parse(this.responseText);
	            scope.jsonOri = Object.assign({}, jsonObj);
	            scope.json = Object.assign({}, jsonObj);
	            
	            var views = {};
	            views.translate = jsonObj.views.translate !== undefined ? jsonObj.views.translate : [0, 0, 0];
	            views.showAxis = jsonObj.views.showAxis !== undefined ? jsonObj.views.showAxis : true;
	            views.camera = jsonObj.views.camera !== undefined  ? jsonObj.views.camera : null;
	            views.backgroundColour = jsonObj.views.backgroundColour !== undefined  ? jsonObj.views.backgroundColour : scope.defaultBgColour;
	            scope.json.views = views;
	                
	            jsonObj = jsonObj.objects;
	            // sort by group name
	            jsonObj.sort(function(a, b) {
	               if(a.name > b.name) return 1;
	               if(a.name < b.name) return -1;
	               return 0;
				});
				
				// add renderOrder
				for(var i=0; i < jsonObj.length; i++) {
					if(!jsonObj[i].renderOrder) jsonObj[i].renderOrder = 0;
				}
	            
	        	scope.json.objects = jsonObj;
	            console.log('loadScene', scope.json);
	            showMessage('');
	            cb();
	        }
	    }
	    let filename = 'mesh.json';
	    if(preset && preset !== 'default') {
	    	filename = 'mesh_' + preset + '.json';
	    }
	    xmlreq.open("GET", "data/tags/" + gDir + "/mesh_result/" + filename);
	    xmlreq.send();
	};
	
	
	PrevisMeshRenderer.prototype._reportProgress = function( event ) {
		var output = Validator.verifyInput( event.detail.text, '' );
		console.log( 'Progress: ' + output );
		showMessage(output, true);
	};
	
	
	PrevisMeshRenderer.prototype._updateBBox = function(bbox) {
		var scope = this;
	    if(!scope.bbox) {
	        scope.bbox = bbox.clone();
	    }
	    else {
	        scope.bbox.min.x = Math.min(scope.bbox.min.x, bbox.min.x);
	        scope.bbox.min.y = Math.min(scope.bbox.min.y, bbox.min.y);
	        scope.bbox.min.z = Math.min(scope.bbox.min.z, bbox.min.z);
	        scope.bbox.max.x = Math.max(scope.bbox.max.x, bbox.max.x);
	        scope.bbox.max.y = Math.max(scope.bbox.max.y, bbox.max.y);
	        scope.bbox.max.z = Math.max(scope.bbox.max.z, bbox.max.z);
	    }
	}
	
	PrevisMeshRenderer.prototype._loadMeshObject = function(group, data, groupName, modelName) {
		var scope = this;
		var path =  "data/tags/" + gDir + "/mesh_result/" + groupName + "/";
		var objLoader = new THREE.OBJLoader2();
		showMessage('Loading model ' + modelName, true);
		
		var callbackOnLoad = function ( event ) {
			scope.modelCount += 1;
			var mesh = event.detail.loaderRootNode;
			mesh.traverse( function(node) {
	            if(node.geometry !== undefined) {
	                var g = new THREE.Geometry()
	                g.fromBufferGeometry(node.geometry);
	                g.mergeVertices();
	                g.computeVertexNormals();
	                node.geometry.fromGeometry(g);
	            }
	        });
	        // neccesary?
	        //mesh.position.y = 0;
            //mesh.rotation.set(1.5708, 0.0, 0.0);
            
			group.add(mesh);
			scope._updateBBox(new THREE.Box3().setFromObject(mesh));
			if(scope.modelCount < scope.numberOfModels) {
				showMessage( 'Loading complete: ' + event.detail.modelName + ' ( ' + scope.modelCount + '/' + scope.numberOfModels + ')', true );
			}
			else {
				//complete
				console.log(mesh);
				scope.finaliseScene();
				showMessage('');
			}
			
		};
		
		objLoader.setModelName( modelName );
		objLoader.setLogging( false, false );
		
		if(data.hasmtl) {
			var onLoadMtl = function ( materials ) {
				objLoader.setMaterials( materials );
				objLoader.load( path + data.obj, callbackOnLoad, null, null, null, false );
			};
			objLoader.loadMtl( path + data.mtl, null, onLoadMtl );
		}
		else {
			var mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
			objLoader.setMaterials( mat );
			objLoader.load( path + data.obj, callbackOnLoad, null, null, null, false );
		}

	}
	
	PrevisMeshRenderer.prototype._loadGroup = function(index) {
		var scope = this;
		const objects = scope.json.objects[index].objects;
		
		var group = new THREE.Group();
		//load meshes
		for(var i=0; i < objects.length; i++) {
			var modelName = scope.json.objects[index].name + '_' + i;
			scope._loadMeshObject(group, objects[i], scope.json.objects[index].name, modelName);
		}
		scope.allGroups.add( group );
		scope.groups.push(group);
	}

	PrevisMeshRenderer.prototype.initContent = function (preset, cb) {
		
		var scope = this;
		scope.loadJsonConfig(preset, function () {
			// count total number of models 
			scope.numberOfModels = 0;
			for(var i=0; i < scope.json.objects.length; i++) {
				scope.numberOfModels += scope.json.objects[i].objects.length;
			}
			scope.modelCount = 0;
			// init models
			for(var i=0; i < scope.json.objects.length; i++) {
				scope._loadGroup(i);
			}
			
			// finish, callback
			cb();
		});
		
	};
	
	PrevisMeshRenderer.prototype.finaliseScene = function() {
		var scope = this;
		console.log('finaliseScene', scope.bbox);
	    
	    var ml = Math.max(Math.abs(scope.bbox.max.x - scope.bbox.min.x), Math.abs(scope.bbox.max.y - scope.bbox.min.y));
		ml = Math.max(ml, Math.abs(scope.bbox.max.z - scope.bbox.min.z));
		scope.maxModelSize = ml;
		console.log(ml);
		
	    //this.axis = new THREE.GridHelper( 5*ml, 50, 0xFF4444, 0xbbbbbb );
	    this.axis = new THREE.AxesHelper( ml );
		this.scene.add( this.axis );
	    
		scope.updateAll();
		scope.loaded = true;
	}
	
	PrevisMeshRenderer.prototype._updateMaterial = function(model, groupData, modelData) {
		
		var meshes = [];
		model.traverse( function( node ) {
		    if ( node instanceof THREE.Mesh ) {
		        meshes.push(node);
		    }
		});
        
        for(var i=0; i < meshes.length; i++) {
        	var mesh = meshes[i];
        	
        	if ( Array.isArray( mesh.material ) ) {
	            for ( var m = 0; m < mesh.material.length; m ++ ) {
	            	if(!modelData.hasmtl) {
	                	mesh.material[m].color.setRGB(groupData.colour[0] / 255, groupData.colour[1] / 255, groupData.colour[2] / 255);
	            	}
	                mesh.material[m].opacity = groupData.alpha;
	                mesh.material[m].transparent = (groupData.alpha < 1.0);
	                mesh.material[m].side = THREE.DoubleSide;
	            }
	        } else {
	        	if(!modelData.hasmtl) {
	            	mesh.material.color.setRGB(groupData.colour[0] / 255, groupData.colour[1] / 255, groupData.colour[2] / 255);
	        	}
	            mesh.material.opacity = groupData.alpha;
	            mesh.material.transparent = (groupData.alpha < 1.0);
	            mesh.material.side = THREE.DoubleSide;
        	}
        }
		        
	}
	
	PrevisMeshRenderer.prototype.updateScene = function() {
		var scope = this;
		const objects = scope.json.objects;
		for(var i=0; i < objects.length; i++) {
			var group = scope.groups[i];
			const groupData = objects[i];
			//group.renderOrder = groupData.renderOrder;
			for(var j=0; j < group.children.length; j++) {
				var model = group.children[j];
				const modelData = objects[i].objects[j];
				
				model.visible = groupData.visible;
				model.renderOrder = groupData.renderOrder;
				scope._updateMaterial(model, groupData, modelData);
			}
		}
	}
	
	PrevisMeshRenderer.prototype._updateObjects = function() {
	    var translate = this.json.views.translate;
	    console.log("updateObjects moveto: ", translate);
	    this.allGroups.position.set(translate[0], translate[1], translate[2]);
	}
	
	PrevisMeshRenderer.prototype.centreObjects = function() {
        console.log("Center objects", this.bbox);
        if(this.bbox === null || this.bbox === undefined) return;
        var x = (this.bbox.min.x + this.bbox.max.x)/2;
        var y = (this.bbox.min.y + this.bbox.max.y)/2;
        var z = (this.bbox.min.z + this.bbox.max.z)/2;
        this.json.views.translate = [-x, -y, -z];
        this._updateObjects();
    }
    
    PrevisMeshRenderer.prototype.resetTranslate = function() {
    	this.json.views.translate = [0, 0, 0];
        this._updateObjects();
	}
	
	PrevisMeshRenderer.prototype.resetRenderOrder = function() {
		console.log('resetRenderOrder');
		var scope = this;
		let objects = scope.json.objects;
		for(var i=0; i < objects.length; i++) {
			scope.json.objects[i].renderOrder = 0;
		}
		this.updateScene();
	}
    
    PrevisMeshRenderer.prototype.updateBackground = function () {
    	this.renderer.setClearColor(new THREE.Color(this.json.views.backgroundColour[0]/255, this.json.views.backgroundColour[1]/255,
    										 this.json.views.backgroundColour[2]/255));
    }
    
    PrevisMeshRenderer.prototype.updateAxis = function() {
    	if(this.axis) {
    		this.axis.visible = this.json.views.showAxis;
    	}
    }
    
    PrevisMeshRenderer.prototype.updateAll = function() {
    	var scope = this;
    	
    	var ml = Math.max(Math.abs(scope.bbox.max.x - scope.bbox.min.x), Math.abs(scope.bbox.max.y - scope.bbox.min.y));
		ml = Math.max(ml, Math.abs(scope.bbox.max.z - scope.bbox.min.z));

		var camConfig = scope.json.views.camera;
		if(camConfig !== null && camConfig !== undefined) {
	        scope.camera.matrix.fromArray(camConfig.matrix);
	        scope.camera.near = camConfig.near;
	        scope.camera.far = camConfig.far;
	        if(camConfig.up !== null && camConfig.up !== undefined)
	        	scope.camera.up.fromArray(camConfig.up);
	        scope.camera.matrix.decompose(scope.camera.position, scope.camera.quaternion, scope.camera.scale); 
	        scope.camera.updateMatrixWorld(true);
	        scope.camera.updateProjectionMatrix();
	    }
	    else {
			scope.camera.near = 0.001*ml;
			scope.camera.far = 10*ml;
			scope.camera.position.z = 1.6*ml;
            scope.camera.updateProjectionMatrix();
	    }
	    
	    this._updateObjects();
    	this.updateAxis();
		this.updateBackground();
		this.updateScene();
    }

	PrevisMeshRenderer.prototype.resizeDisplayGL = function () {
		this.controls.handleResize();

		this.recalcAspectRatio();
		this.renderer.setSize( this.canvas.offsetWidth, this.canvas.offsetHeight, false );

		this.updateCamera();
	};

	PrevisMeshRenderer.prototype.recalcAspectRatio = function () {
		this.aspectRatio = ( this.canvas.offsetHeight === 0 ) ? 1 : this.canvas.offsetWidth / this.canvas.offsetHeight;
	};

	PrevisMeshRenderer.prototype.resetCamera = function () {
		this.camera.position.copy( this.cameraDefaults.posCamera );
		this.cameraTarget.copy( this.cameraDefaults.posCameraTarget );

		this.updateCamera();
	};

	PrevisMeshRenderer.prototype.updateCamera = function () {
		this.camera.aspect = this.aspectRatio;
		this.camera.lookAt( this.cameraTarget );
		this.camera.updateProjectionMatrix();
	};

	PrevisMeshRenderer.prototype.switchCameraControl = function(type) {
		var scope = this;
		if(type === 'Fly control') {
			if(this.controls) { this.controls.dispose(); this.controls = null; };
			this.controls = new THREE.FlyControls( this.camera, this.renderer.domElement );
			let camControls = this.controls;
			camControls.movementSpeed = Math.max(scope.maxModelSize/6, 1);
			camControls.rollSpeed = 0.25;
			camControls.dragToLook = true;
			camControls.autoForward = false;
		}
		else {
			if(this.controls) { this.controls.dispose(); this.controls = null; };
			this.controls = new THREE.TrackballControls( this.camera, this.renderer.domElement );
		}
	}

	PrevisMeshRenderer.prototype.render = function () {
		if ( ! this.renderer.autoClear ) this.renderer.clear();
		var delta = this.clock.getDelta();
		this.controls.update(delta);
		this.renderer.render( this.scene, this.camera );
	};

	PrevisMeshRenderer.prototype.generateThumbnail = function (callback) {
		this.renderer.render( this.scene, this.camera );
		var imgData = this.renderer.domElement.toDataURL();
		resizeImage(imgData, function(resizedImg) {
			callback(resizedImg);
		});
	};

	return PrevisMeshRenderer;

})();