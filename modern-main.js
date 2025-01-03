const app = new Vue({
    el: '#app',
    data: {
        // ROS Connection
        ros: null,
        rosbridge_address: 'ws://0.0.0.0:9090',
        connected: false,
        map3dViewer: null,

        // UI State
        activeTab: 'Mapping',
        tabs: ['Mapping', 'Control', 'Settings'],
        
        // Joystick State
        dragging: false,
        x: 'no',
        y: 'no',
        dragCircleStyle: {
            margin: '0px',
            top: '0px',
            left: '0px',
            display: 'none',
            width: '75px',
            height: '75px'
        },
        joystick: {
            vertical: 0,
            horizontal: 0
        },
        
        // Map & Camera State
        mapViewer: null,
        mapGridClient: null,
        mapViewerControl: null,
        mapNavClientControl: null,
        interval: null,
        
        // Camera Settings
        cameraHost: '0.0.0.0',
        cameraPort: 11315,
        cameraTopic: '/camera/color/image_raw',
        
        // Map Settings
        mapSettings: {
            width: 800,
            height: 600,
            gridResolution: 0.05,
            gridSize: 20
        },
        setNavGoalActive: false,
        showNavConfirm: false,
        currentNavGoal: null,
        setInitialPoseActive: false,
        showInitialPoseConfirm: false,
        currentInitialPose: null
    },
    
    methods: {
        toggleSetInitialPose() {
            if (this.setNavGoalActive) {
                this.setNavGoalActive = false;
                this.removeNavGoalListeners();
            }
            this.setInitialPoseActive = !this.setInitialPoseActive;
            if (this.map3dViewer) {
                if (this.setInitialPoseActive) {
                    this.map3dViewer.enableNavGoalMode('initial');
                    this.setupInitialPoseListeners();
                } else {
                    this.map3dViewer.disableNavGoalMode();
                    this.removeInitialPoseListeners();
                }
            }
        },

        setupInitialPoseListeners() {
            const mapElement = document.getElementById('map');
            mapElement.addEventListener('mousedown', this.handleInitialPoseMouseDown);
            mapElement.addEventListener('mousemove', this.handleInitialPoseMouseMove);
            mapElement.addEventListener('mouseup', this.handleInitialPoseMouseUp);
        },

        removeInitialPoseListeners() {
            const mapElement = document.getElementById('map');
            mapElement.removeEventListener('mousedown', this.handleInitialPoseMouseDown);
            mapElement.removeEventListener('mousemove', this.handleInitialPoseMouseMove);
            mapElement.removeEventListener('mouseup', this.handleInitialPoseMouseUp);
            if (this.map3dViewer) {
                this.map3dViewer.hideVirtualGoal();
            }
            this.showInitialPoseConfirm = false;
        },

        handleInitialPoseMouseDown(event) {
            if (!this.setInitialPoseActive || !this.map3dViewer) return;
            
            const result = this.map3dViewer.handleMapClick(event, true);
            if (result) {
                this.currentInitialPose = {
                    position: result.position,
                    orientation: result.orientation
                };
            }
        },
        
        handleInitialPoseMouseUp(event) {
            if (!this.setInitialPoseActive || !this.map3dViewer) return;
            
            if (this.currentInitialPose) {
                this.showInitialPoseConfirm = true;
                this.map3dViewer.isPositionSelected = false;
            }
        },
  
        handleInitialPoseMouseMove(event) {
            if (!this.setInitialPoseActive || !this.map3dViewer || !this.map3dViewer.isPositionSelected) return;
            
            const result = this.map3dViewer.handleMouseMove(event);
            if (result) {
                this.currentInitialPose.orientation = result.orientation;
            }
        },

        confirmInitialPose() {
            if (!this.currentInitialPose || !this.map3dViewer) return;
            
            const position = new THREE.Vector3(
                this.currentInitialPose.position.x,
                0,
                this.currentInitialPose.position.y
            );
            
            this.map3dViewer.confirmInitialPose(position, this.currentInitialPose.orientation);
            this.showNotification('Initial pose set', 'success');
            this.currentInitialPose = null;
            this.showInitialPoseConfirm = false;
            this.setInitialPoseActive = false;
            this.map3dViewer.disableNavGoalMode();
            this.removeInitialPoseListeners();
        },

        setActiveTab(tab) {
            this.activeTab = tab;
            if (tab === 'Mapping') {
                this.initializeMapping();
            } else if (tab === 'Control') {
                this.initializeControl();
            }
        },
        
        getTabIcon(tab) {
            const icons = {
                'Mapping': 'fas fa-map',
                'Control': 'fas fa-gamepad',
                'Settings': 'fas fa-cog'
            };
            return icons[tab];
        },
        
        toggleConnection() {
            if (this.connected) {
                this.disconnect();
            } else {
                this.connect();
            }
        },
        
        connect() {
            console.log('Connecting to ROSBridge...');
            this.ros = new ROSLIB.Ros({
                url: this.rosbridge_address
            });

            this.ros.on('connection', () => {
                this.connected = true;
                console.log('Connected to ROSBridge!');
                this.showNotification('Connected to Robot', 'success');
                this.initializeMapAndCamera();
            });

            this.ros.on('error', (error) => {
                console.error('ROSBridge error:', error);
                this.showNotification('Connection Error', 'error');
            });

            this.ros.on('close', () => {
                this.connected = false;
                console.log('ROSBridge connection closed');
                this.showNotification('Disconnected from Robot', 'info');
            });
        },

        disconnect() {
            if (this.ros) {
                this.ros.close();
                this.cleanupMapAndCamera();
            }
        },

        startDrag(event) {
            this.dragging = true;
            this.x = this.y = 0;
            this.updateJoystickPosition(event);
        },

        stopDrag() {
            this.dragging = false;
            this.x = this.y = 'no';
            this.dragCircleStyle.display = 'none';
            this.resetJoystickVals();
            this.publishVelocityCommand(0, 0);
        },

        doDrag(event) {
            if (this.dragging) {
                this.updateJoystickPosition(event);
                this.calculateAndPublishVelocity(event);
            }
        },

        updateJoystickPosition(event) {
            const rect = event.target.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const radius = Math.min(rect.width, rect.height) / 2;
            
            const dx = x - centerX;
            const dy = y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            const scale = distance > radius ? radius / distance : 1;
            
            this.dragCircleStyle.display = 'block';
            this.dragCircleStyle.left = `${centerX + dx * scale - parseInt(this.dragCircleStyle.width) / 2}px`;
            this.dragCircleStyle.top = `${centerY + dy * scale - parseInt(this.dragCircleStyle.height) / 2}px`;
            
            this.joystick.vertical = -((y - centerY) / radius);
            this.joystick.horizontal = (x - centerX) / radius;
        },

        calculateAndPublishVelocity(event) {
            const maxLinearVelocity = 1.0;
            const maxAngularVelocity = 1.0;
            
            const linearVel = this.joystick.vertical * maxLinearVelocity;
            const angularVel = -this.joystick.horizontal * maxAngularVelocity;
            
            this.publishVelocityCommand(linearVel, angularVel);
        },

        publishVelocityCommand(linear, angular) {
            if (!this.ros) return;
            
            const cmdVel = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            });

            const twist = new ROSLIB.Message({
                linear: { x: linear, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: angular }
            });

            cmdVel.publish(twist);
        },

        resetJoystickVals() {
            this.joystick.vertical = 0;
            this.joystick.horizontal = 0;
        },

        initializeMapping() {
            if (!this.ros) {
                this.showNotification('Please connect to ROS first', 'error');
                return;
            }
            
            try {
                // Clear previous viewers
                if (this.mapViewer || this.map3dViewer) {
                    document.getElementById('map').innerHTML = '';
                }
                
                console.log('Initializing 3D map viewer...');
                
                // Initialize 3D viewer with robot visualization
                this.map3dViewer = new Map3DViewer('map', {
                    width: this.mapSettings.width,
                    height: this.mapSettings.height,
                    wallHeight: 1.5,
                    cellSize: 0.05,
                    robotHeight: 0.5,
                    robotRadius: 0.3
                });
                
                // Initialize ROS subscription for robot pose
                this.map3dViewer.initROSSubscription(this.ros);

                // Subscribe to map updates
                const mapTopic = new ROSLIB.Topic({
                    ros: this.ros,
                    name: '/map',
                    messageType: 'nav_msgs/OccupancyGrid'
                });

                mapTopic.subscribe((message) => {
                    console.log('Received map update');
                    this.map3dViewer.updateMap(message);
                });

                console.log('Map initialization complete');
                this.showNotification('Map viewer initialized', 'success');
            } catch (error) {
                console.error('Error initializing map:', error);
                this.showNotification('Failed to initialize map: ' + error.message, 'error');
                
                if (this.mapViewer) {
                    document.getElementById('map').innerHTML = '';
                    this.mapViewer = null;
                }
                if (this.mapGridClient) {
                    this.mapGridClient = null;
                }
            }
        },

        initializeMapAndCamera() {
            this.initializeMapping();
            this.initializeCamera();
        },

        initializeCamera() {
            try {
                const primaryViewer = new MJPEGCANVAS.Viewer({
                    divID: 'divCamera',
                    host: this.cameraHost,
                    port: this.cameraPort,
                    width: 720,
                    height: 480,
                    topic: this.cameraTopic,
                    ssl: false
                });

                const secondaryViewer = new MJPEGCANVAS.Viewer({
                    divID: 'divCameraControl',
                    host: this.cameraHost,
                    port: this.cameraPort,
                    width: 720,
                    height: 480,
                    topic: this.cameraTopic,
                    ssl: false
                });
            } catch (error) {
                console.error('Error initializing camera:', error);
                this.showNotification('Failed to initialize camera: ' + error.message, 'error');
            }
        },

        cleanupMapAndCamera() {
            if (this.map3dViewer && this.map3dViewer.currentGoal) {
                this.map3dViewer.cancelCurrentGoal();
            }
            
            if (this.mapViewer) {
                document.getElementById('map').innerHTML = '';
                this.mapViewer = null;
            }
            if (this.mapViewerControl) {
                this.mapViewerControl = null;
            }
            if (this.map3dViewer) {
                document.getElementById('map').innerHTML = '';
                this.map3dViewer = null;
            }

            document.getElementById('divCamera').innerHTML = '';
            document.getElementById('divCameraControl').innerHTML = '';
            
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
            }
        },

        showNotification(message, type = 'info') {
            console.log(`${type.toUpperCase()}: ${message}`);
        },

        startMapping() {
            this.showNotification('Starting mapping process...', 'info');
            this.initializeMapAndCamera();
        },

        resetView() {
            if (this.map3dViewer) {
                this.map3dViewer.camera.position.set(10, 10, 10);
                this.map3dViewer.camera.lookAt(0, 0, 0);
                this.map3dViewer.controls.reset();
            }
        },

        toggleSetNavGoal() {
            if (this.setInitialPoseActive) {
                this.setInitialPoseActive = false;
                this.removeInitialPoseListeners();
            }
            this.setNavGoalActive = !this.setNavGoalActive;
            if (this.map3dViewer) {
                if (this.setNavGoalActive) {
                    this.map3dViewer.enableNavGoalMode('nav');
                    this.setupNavGoalListeners();
                } else {
                    this.map3dViewer.disableNavGoalMode();
                    this.removeNavGoalListeners();
                }
            }
        },
    
        setupNavGoalListeners() {
            const mapElement = document.getElementById('map');
            mapElement.addEventListener('mousedown', this.handleMapMouseDown);
            mapElement.addEventListener('mousemove', this.handleMapMouseMove);
            mapElement.addEventListener('mouseup', this.handleMapMouseUp);
        },
    
        removeNavGoalListeners() {
            const mapElement = document.getElementById('map');
            mapElement.removeEventListener('mousedown', this.handleMapMouseDown);
            mapElement.removeEventListener('mousemove', this.handleMapMouseMove);
            mapElement.removeEventListener('mouseup', this.handleMapMouseUp);
            if (this.map3dViewer) {
                this.map3dViewer.hideVirtualGoal();
            }
            this.showNavConfirm = false;
        },
        handleMapMouseDown(event) {
            if (!this.setNavGoalActive || !this.map3dViewer) return;
        
            const result = this.map3dViewer.handleMapClick(event, true);
            if (result) {
                this.currentNavGoal = {
                    position: result.position,
                    orientation: result.orientation
                };
            }
        },
        
        handleMapMouseUp(event) {
            if (!this.setNavGoalActive || !this.map3dViewer) return;
            
            if (this.currentNavGoal) {
                this.showNavConfirm = true;
                this.map3dViewer.isPositionSelected = false;
            }
        },
  
        handleMapMouseMove(event) {
            if (!this.setNavGoalActive || !this.map3dViewer || !this.map3dViewer.isPositionSelected) return;
        
            const result = this.map3dViewer.handleMouseMove(event);
            if (result) {
                this.currentNavGoal.orientation = result.orientation;
            }
        },
        
        confirmNavGoal() {
            if (!this.currentNavGoal || !this.map3dViewer) return;
            
            const position = new THREE.Vector3(
                this.currentNavGoal.position.x,
                0,
                this.currentNavGoal.position.y
            );
            this.map3dViewer.confirmNavGoal(position, this.currentNavGoal.orientation);
            this.showNotification('Navigation goal sent to move_base', 'success');
            this.currentNavGoal = null;
            this.showNavConfirm = false;
            this.setNavGoalActive = false;
            this.map3dViewer.disableNavGoalMode();
            this.removeNavGoalListeners();
        },
    
        cancelNavGoal() {
            if (this.map3dViewer && this.map3dViewer.currentGoal) {
                this.map3dViewer.cancelCurrentGoal();
            }
            this.currentNavGoal = null;
            this.currentInitialPose = null;
            this.showNavConfirm = false;
            this.showInitialPoseConfirm = false;
            this.setNavGoalActive = false;
            this.setInitialPoseActive = false;
            if (this.map3dViewer) {
                this.map3dViewer.hideVirtualGoal();
                this.map3dViewer.disableNavGoalMode();
            }
            this.removeNavGoalListeners();
            this.removeInitialPoseListeners();
            this.showNotification('Goal cancelled', 'info');
        },
    },

    mounted() {
        window.addEventListener('mouseup', this.stopDrag);
        window.addEventListener('mouseleave', this.stopDrag);

        if (this.rosbridge_address) {
            this.connect();
        }
    },

    beforeDestroy() {
        // Clean up any active goals before destroying
        if (this.map3dViewer && this.map3dViewer.currentGoal) {
            this.map3dViewer.cancelCurrentGoal();
        }
        
        window.removeEventListener('mouseup', this.stopDrag);
        window.removeEventListener('mouseleave', this.stopDrag);
        this.disconnect();
    }
});