
let idGlobal = 8;

let vueApp = new Vue({

    el: "#vueApp",
    name: "clone-on-control",
    display: "Clone on Control",
    instruction: "Press Ctrl to clone element from list 1",
    order: 4,
    
    data: {
        // ros connection
        ros: null,
        rosbridge_address: 'ws://0.0.0.0:9090',
        connected: false,

        position: { x: 0, y: 0, z: 0, },
        // page content
        menu_title: 'Connection',
        main_title: 'Main title, from Vue!!',
        logs: [],
        loading: false,

        // jos stick data ********* 
        dragging: false,
        x: 'no',
        y: 'no',
        dragCircleStyle: {
            margin: '0px',
            top: '0px',
            left: '0px',
            display: 'none',
            width: '75px',
            height: '75px',
        },
        // joystick valules
        joystick: {
            vertical: 0,
            horizontal: 0,
        },

        // mapping data **************
        mapViewer: null,
        mapGridClient: null,
        interval: null,
        //  map navigation control tab
        // mapping data **************
        mapViewerControl: null,
        mapNavClientControl: '',
        intervalControl: null,
   
        // dragable div
        
        list1: [
            { name: "Jesus", id: 1 },
            { name: "Paul", id: 2 },
            { name: "Peter", id: 3 }
          ],
          list2: [
            { name: "Luc", id: 5 },
            { name: "Thomas", id: 6 },
            { name: "John", id: 7 }
          ],
          controlOnStart: true
    },
    methods: {
        connect: function() {
            // define ROSBridge connection object
            this.ros = new ROSLIB.Ros({
                url: this.rosbridge_address
            })

            // define callbacks
            this.ros.on('connection', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Connected!')

                this.connected = true
                console.log('Connection to ROSBridge established!')
            })
            this.ros.on('error', (error) => {
                console.log('Something went wrong when trying to connect')
                console.log(error)
            })
            this.ros.on('close', () => {
                this.connected = false
                console.log('Connection to ROSBridge was closed!')
            })
        },
        disconnect: function() {
            this.ros.close()
        },
        startMapping: function() {
            this.setCamera()
            this.setMap()
        },
        
        finishMapping: function() {
            this.closeCamera()
        },
        // start control
        startControl: function() {
            this.setCameraControl()
            this.setMapControl()
        },
        startDrag() {
            this.dragging = true
            this.x = this.y = 0
        },
        finishControl: function() {
            this.closeCamera()
        },
        stopDrag() {
            this.dragging = false
            this.x = this.y = 'no'
            this.dragCircleStyle.display = 'none'
            this.resetJoystickVals()
        },
        doDrag(event) {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
            
            if (this.dragging) {
                this.x = event.offsetX
                this.y = event.offsetY
                let ref = document.getElementById('dragstartzone')
                this.dragCircleStyle.display = 'inline-block'

                let minTop = ref.offsetTop - parseInt(this.dragCircleStyle.height) / 2
                let maxTop = minTop + 200
                let top = this.y + minTop
                this.dragCircleStyle.top = `${top}px`

                let minLeft = ref.offsetLeft - parseInt(this.dragCircleStyle.width) / 2
                let maxLeft = minLeft + 200
                let left = this.x + minLeft
                this.dragCircleStyle.left = `${left}px`
                
                let message = new ROSLIB.Message({
                    linear: { x: -1 * ((this.y / 200) - 0.5), y: 0, z: 0, },
                    angular: { x: 0, y: 0, z: -1 * ((this.x / 200) - 0.5), },
                })
                topic.publish(message)
                this.setJoystickVals()
            }
        },
        setJoystickVals() {
            this.joystick.vertical = -1 * ((this.y / 200) - 0.5)
            this.joystick.horizontal = +1 * ((this.x / 200) - 0.5)
            

        },
        resetJoystickVals() {
            this.joystick.vertical = 0
            this.joystick.horizontal = 0
            
        },
        // configer camera *******************
        
        setCamera: function() {
            let without_ws = this.rosbridge_address.split('ws://')[1]
            console.log(without_ws)
            let domain = without_ws.split('/')[0] 
            console.log('domain is :')

            console.log(domain)
            // let host = 'http://0.0.0.0:8080'
            var divID = 'mjpegViewer'; // ID of the div where the viewer will be placed
            var width = 640; // Width of the viewer
            var height = 480; // Height of the viewer
            var host = '0.0.0.0'; // Host of the MJPEG stream
            var port = 8080; // Port of the MJPEG stream
            var quality = 100; // Quality of the MJPEG stream
            // in semulation
            // var currentTopic = '/camera/camera/color/image_raw'; // Topic of the MJPEG stream
            // in real 
            var currentTopic = '/camera/color/image_raw'; // Topic of the MJPEG stream

            var canvas = document.getElementById('overlayCanvas'); // Overlay canvas element

            let viewer = new MJPEGCANVAS.Viewer({
                divID: 'divCamera',
                host: host,
                port:port,
                width: 720,
                height: 430,
                // real
                topic: '/camera/color/image_raw',

                ssl: false,
            })
            console.log(viewer)

        },
        closeCamera: function() {
            document.getElementById('divCamera').innerHTML = ''
            console.log('Finish mapping will close camera!')
        },
        // camera for control tap *******************
        setCameraControl: function() {
            let without_ws = this.rosbridge_address.split('ws://')[1]
            console.log(without_ws)
            let domain = without_ws.split('/')[0] 
            console.log('domain is :')

            console.log(domain)
            // let host = 'http://0.0.0.0:8080'
            var divID = 'mjpegViewer'; // ID of the div where the viewer will be placed
            var width = 640; // Width of the viewer
            var height = 480; // Height of the viewer
            var host = '0.0.0.0'; // Host of the MJPEG stream
            var port = 8080; // Port of the MJPEG stream
            var quality = 100; // Quality of the MJPEG stream
            var currentTopic = '/camera/color/image_raw'; // Topic of the MJPEG stream
            var canvas = document.getElementById('overlayCanvas'); // Overlay canvas element

            let viewer = new MJPEGCANVAS.Viewer({
                divID: 'divCameraCotrol',
                host: host,
                port:port,
                width: 720,
                height: 430,
                topic: '/camera/color/image_raw',
                ssl: false,
            })
            console.log(viewer)

        },
        closeCameraControl: function() {
            document.getElementById('divCameraCotrol').innerHTML = ''
            console.log('Finish control will close camera!')
        },
        // configer map *******************
        setMap: function() {
            this.mapViewer = new ROS2D.Viewer({
                divID: 'map',
                width: 420,
                height: 360
            })

            // Setup the map client.
            this.mapGridClient = new ROS2D.OccupancyGridClient({
                ros: this.ros,
                rootObject: this.mapViewer.scene,
                continuous: true,
            })
            // Scale the canvas to fit to the map
            this.mapGridClient.on('change', () => {
                this.mapViewer.scaleToDimensions(this.mapGridClient.currentGrid.width, this.mapGridClient.currentGrid.height);
                this.mapViewer.shift(this.mapGridClient.currentGrid.pose.position.x, this.mapGridClient.currentGrid.pose.position.y)
            })
        },
        stopMapping: function() {
            this.mapViewer = null
            this.mapGridClient = null
            clearInterval(this.interval)
            document.getElementById('map').innerHTML = ''

        },
        // configer map and navigation for control tap *******************
        setMapControl: function() {
            this.mapViewerControl = new ROS2D.Viewer({
                divID: 'map',
                width: 720,
                height: 430
            })
        
            // Setup the map client.
            this.mapNavClientControl =  NAV2D.OccupancyGridClientNav({ // <-- Add 'new' here
                ros: this.ros,
                rootObject: this.mapViewerControl.scene,
                viewer: this.mapViewerControl,
                serverName: '/move_base',
                withOrientation: true
        
            })
            this.mapNavClientControl.on()
            // Scale the canvas to fit to the map
        },
        stopMappingControl: function() {
            this.mapViewerControl = null
            this.mapNavClientControl = null
            clearInterval(this.interval)
            document.getElementById('map').innerHTML = ''

        },
        // dragable div
        clone({ name }) {
            return { name, id: idGlobal++ };
          },
          pullFunction() {
            return this.controlOnStart ? "clone" : true;
          },
          start({ originalEvent }) {
            this.controlOnStart = originalEvent.ctrlKey;
          }

    },
    mounted() {
        // page is ready
        console.log('page is ready!')
        window.addEventListener('mouseup', this.stopDrag)

    },
    
})