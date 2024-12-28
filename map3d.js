// map3d.js
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

        // Start animation
        this.animate();
    }

    addLights() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x666666);
        this.scene.add(ambientLight);

        // Directional light
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(10, 10, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);
    }

    addGrid() {
        // Ground plane
        const groundGeometry = new THREE.PlaneGeometry(50, 50);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Grid helper
        const gridHelper = new THREE.GridHelper(50, 50, 0x666666, 0x444444);
        this.scene.add(gridHelper);
    }

    createRobot() {
        // Remove existing robot if any
        if (this.robot) {
            this.scene.remove(this.robot);
        }

        // Create robot group
        this.robot = new THREE.Group();

        // Create robot body (cylinder)
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

        // Create direction indicator (arrow)
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

    updateMap(occupancyGrid) {
        // Clear previous map
        if (this.gridMap) {
            this.scene.remove(this.gridMap);
        }

        // Create new group for map
        this.gridMap = new THREE.Group();

        // Store map metadata for pose transformations
        this.mapMetadata = {
            resolution: occupancyGrid.info.resolution,
            width: occupancyGrid.info.width,
            height: occupancyGrid.info.height,
            origin: occupancyGrid.info.origin
        };

        // Convert occupancy grid to 3D objects
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
                if (value > 50) { // Occupied cell
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

        // Update grid size based on map size
        const mapSize = Math.max(width * resolution, height * resolution);
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }
        this.gridHelper = new THREE.GridHelper(mapSize, Math.floor(mapSize/resolution), 0x666666, 0x444444);
        this.scene.add(this.gridHelper);

        // Update ground plane
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
                // Update position directly from AMCL pose
                this.robot.position.x = pose.position.x;
                this.robot.position.z = -pose.position.y;  // Negate Y for proper orientation
                this.robot.position.y = this.options.robotHeight / 2;

                // Update orientation
                const quaternion = new THREE.Quaternion(
                    pose.orientation.x,
                    pose.orientation.y,
                    pose.orientation.z,
                    pose.orientation.w
                );
                
                // Apply correction to match RViz orientation
                const correctionQuaternion = new THREE.Quaternion();
                correctionQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
                quaternion.multiply(correctionQuaternion);
                
                this.robot.setRotationFromQuaternion(quaternion);
            }
        });
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