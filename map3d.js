class Map3DViewer {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.options = {
            width: options.width || 800,
            height: options.height || 600,
            gridSize: options.gridSize || 20,
            cellSize: options.cellSize || 0.05,
            wallHeight: options.wallHeight || 2,
            robotHeight: options.robotHeight || 0.5,
            robotRadius: options.robotRadius || 0.3
        };

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, this.options.width / this.options.height, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.controls = null;
        this.gridMap = null;
        this.robot = null;
        this.ros = null;
        this.mapMetadata = null;
        this.mapOrigin = null;
        this.virtualGoal = null;
        this.navGoalMode = false;
        this.selectedPosition = null;
        this.isPositionSelected = false;
        this.init();
    }

    init() {
        // Setup renderer
        this.renderer.setSize(this.options.width, this.options.height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Setup scene
        this.scene.background = new THREE.Color(0x1a1a1a);
        this.scene.fog = new THREE.FogExp2(0x1a1a1a, 0.02);

        // Setup camera
        this.camera.position.set(10, 10, 10);
        this.camera.lookAt(0, 0, 0);

        // Setup controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Add lights
        this.addLights();

        // Add grid
        this.addGrid();

        // Create robot
        this.createRobot();

        // Create virtual goal marker
        this.createVirtualGoal();

        // Start animation
        this.animate();
    }

    addLights() {
        const ambientLight = new THREE.AmbientLight(0x666666);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(10, 10, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);
    }

    addGrid() {
        const groundGeometry = new THREE.PlaneGeometry(50, 50);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        this.gridHelper = new THREE.GridHelper(50, 50, 0x666666, 0x444444);
        this.scene.add(this.gridHelper);
    }

    createRobot() {
        if (this.robot) {
            this.scene.remove(this.robot);
        }

        this.robot = new THREE.Group();

        const bodyGeometry = new THREE.CylinderGeometry(
            this.options.robotRadius,
            this.options.robotRadius,
            this.options.robotHeight,
            32
        );
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: 0x00ff00,
            shininess: 30
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = this.options.robotHeight / 2;
        body.castShadow = true;
        this.robot.add(body);

        const arrowGeometry = new THREE.ConeGeometry(
            this.options.robotRadius / 2,
            this.options.robotHeight / 2,
            8
        );
        const arrowMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000
        });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.position.set(0, this.options.robotHeight / 2, -this.options.robotRadius);
        arrow.rotation.x = Math.PI / 2;
        this.robot.add(arrow);

        this.scene.add(this.robot);
    }

    createVirtualGoal() {
        const goalGroup = new THREE.Group();
        
        // Create a longer, more visible arrow
        const arrowLength = 1.0;
        const arrowWidth = 0.3;
        const arrowColor = 0x00ff00;
        
        // Arrow shaft
        const shaftGeometry = new THREE.BoxGeometry(arrowLength, 0.1, arrowWidth);
        const material = new THREE.MeshPhongMaterial({
            color: arrowColor,
            transparent: true,
            opacity: 0.8
        });
        const shaft = new THREE.Mesh(shaftGeometry, material);
        shaft.position.x = arrowLength / 2;
        goalGroup.add(shaft);
        
        // Arrow head
        const headGeometry = new THREE.ConeGeometry(arrowWidth, arrowLength * 0.4, 8);
        const head = new THREE.Mesh(headGeometry, material);
        head.rotation.z = -Math.PI / 2;
        head.position.x = arrowLength;
        goalGroup.add(head);
        
        // Base circle
        const baseGeometry = new THREE.CircleGeometry(0.2, 32);
        const baseMaterial = new THREE.MeshPhongMaterial({
            color: arrowColor,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.rotation.x = -Math.PI / 2;
        goalGroup.add(base);
        
        goalGroup.visible = false;
        this.scene.add(goalGroup);
        this.virtualGoal = goalGroup;
    }

    updateMap(occupancyGrid) {
        if (this.gridMap) {
            this.scene.remove(this.gridMap);
        }

        this.gridMap = new THREE.Group();

        this.mapMetadata = {
            resolution: occupancyGrid.info.resolution,
            width: occupancyGrid.info.width,
            height: occupancyGrid.info.height,
            origin: occupancyGrid.info.origin
        };

        const width = occupancyGrid.info.width;
        const height = occupancyGrid.info.height;
        const data = occupancyGrid.data;
        const resolution = occupancyGrid.info.resolution;

        const wallGeometry = new THREE.BoxGeometry(
            resolution,
            this.options.wallHeight,
            resolution
        );
        const wallMaterial = new THREE.MeshPhongMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.8
        });

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = data[y * width + x];
                if (value > 50) {
                    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                    wall.position.set(
                        (x * resolution) + occupancyGrid.info.origin.position.x,
                        this.options.wallHeight/2,
                        -(y * resolution) - occupancyGrid.info.origin.position.y
                    );
                    wall.castShadow = true;
                    wall.receiveShadow = true;
                    this.gridMap.add(wall);
                }
            }
        }

        this.scene.add(this.gridMap);

        const mapSize = Math.max(width * resolution, height * resolution);
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }
        this.gridHelper = new THREE.GridHelper(mapSize, Math.floor(mapSize/resolution), 0x666666, 0x444444);
        this.scene.add(this.gridHelper);

        if (this.ground) {
            this.scene.remove(this.ground);
        }
        const groundGeometry = new THREE.PlaneGeometry(mapSize, mapSize);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);
    }

    initROSSubscription(ros) {
        if (!ros) {
            console.error('ROS connection not provided');
            return;
        }
        this.ros = ros;
    
        const amclPose = new ROSLIB.Topic({
            ros: this.ros,
            name: '/amcl_pose',
            messageType: 'geometry_msgs/PoseWithCovarianceStamped'
        });
    
        amclPose.subscribe((message) => {
            const pose = message.pose.pose;
            if (this.robot) {
                this.robot.position.x = pose.position.x;
                this.robot.position.z = -pose.position.y;
                this.robot.position.y = this.options.robotHeight / 2;

                const quaternion = new THREE.Quaternion(
                    pose.orientation.x,
                    pose.orientation.y,
                    pose.orientation.z,
                    pose.orientation.w
                );
                
                const correctionQuaternion = new THREE.Quaternion();
                correctionQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
                quaternion.multiply(correctionQuaternion);
                
                this.robot.setRotationFromQuaternion(quaternion);
            }
        });
    }

    handleMapClick(event) {
        if (!this.navGoalMode) return null;

        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersectPoint);

        if (intersectPoint) {
            this.selectedPosition = intersectPoint;
            this.isPositionSelected = true;
            return intersectPoint;
        }
        return null;
    }

    handleMouseMove(event) {
        if (!this.isPositionSelected || !this.selectedPosition) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const selectedPoint = this.selectedPosition.clone();
        selectedPoint.project(this.camera);
        const screenX = (selectedPoint.x + 1) * rect.width / 2 + rect.left;
        const screenY = (-selectedPoint.y + 1) * rect.height / 2 + rect.top;

        const dx = mouseX - screenX;
        const dy = mouseY - screenY;
        const angle = Math.atan2(dy, dx);

        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle);

        this.updateVirtualGoal(this.selectedPosition, quaternion);

        return { position: this.selectedPosition, orientation: quaternion };
    }

    updateVirtualGoal(position, orientation) {
        if (!this.virtualGoal) {
            this.createVirtualGoal();
        }

        this.virtualGoal.position.copy(position);
        this.virtualGoal.setRotationFromQuaternion(orientation);
        this.virtualGoal.visible = true;
    }

    hideVirtualGoal() {
        if (this.virtualGoal) {
            this.virtualGoal.visible = false;
        }
    }

    enableNavGoalMode() {
        this.navGoalMode = true;
        this.isPositionSelected = false;
        this.selectedPosition = null;
        this.renderer.domElement.style.cursor = 'crosshair';
    }

    disableNavGoalMode() {
        this.navGoalMode = false;
        this.isPositionSelected = false;
        this.selectedPosition = null;
        this.renderer.domElement.style.cursor = 'default';
        this.hideVirtualGoal();
    }

    confirmNavGoal(position, quaternion) {
        if (!this.ros) return;

        // Create an ActionClient for move_base
        const actionClient = new ROSLIB.ActionClient({
            ros: this.ros,
            actionName: 'move_base_msgs/MoveBaseAction',
            serverName: '/move_base'
        });

        // Create the goal message directly
        const goalMessage = {
            target_pose: {
                header: {
                    frame_id: 'map',
                    stamp: {
                        secs: Math.floor(Date.now() / 1000),
                        nsecs: (Date.now() % 1000) * 1000000
                    }
                },
                pose: {
                    position: {
                        x: position.x,
                        y: -position.z,  // Convert from Three.js Z to ROS Y
                        z: 0.0
                    },
                    orientation: {
                        x: quaternion.x,
                        y: quaternion.y,
                        z: quaternion.z,
                        w: quaternion.w
                    }
                }
            }
        };

        // Log the goal for verification
        console.log('Sending navigation goal:', goalMessage);

        // Create the goal with the message
        const goal = new ROSLIB.Goal({
            actionClient: actionClient,
            goalMessage: goalMessage
        });

        // Add goal callbacks
        goal.on('result', function(result) {
            console.log('Navigation goal result received:', result);
            this.hideVirtualGoal();
        }.bind(this));

        goal.on('feedback', function(feedback) {
            console.log('Navigation goal feedback:', feedback);
        });

        goal.on('status', function(status) {
            console.log('Navigation goal status:', status);
        });

        // Store the current goal
        this.currentGoal = goal;

        // Send the goal
        goal.send();
    }

    cancelCurrentGoal() {
        if (this.currentGoal) {
            this.currentGoal.cancel();
            this.currentGoal = null;
            this.hideVirtualGoal();
            console.log('Current navigation goal cancelled');
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    setSize(width, height) {
        this.options.width = width;
        this.options.height = height;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}