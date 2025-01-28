import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

export class BeatSaberGame {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.controllers = [];
    this.sabers = [];
    this.blocks = [];
    this.clock = new THREE.Clock();
    this.isVR = false;
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    this.leftSaber = null;
    this.rightSaber = null;
    this.score = 0;
    this.desktopSabers = []; // Track desktop sabers separately
    this.vrSabers = []; // Track VR sabers separately
    this.scoreText3D = null; // Add reference for 3D score
    this.helpText3D = null; // Add reference for 3D help text

    this.init();
  }

  init() {
    // Setup renderer
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    document.body.appendChild(this.renderer.domElement);
    document.body.appendChild(VRButton.createButton(this.renderer));

    // Setup camera with better position for desktop view
    this.camera.position.set(0, 1.6, 4); // Move camera further back
    this.camera.lookAt(0, 1.6, -2); // Look slightly forward

    // Add skybox
    const skyboxLoader = new THREE.CubeTextureLoader();
    const skyboxTexture = skyboxLoader.load([
      "https://threejs.org/examples/textures/cube/Bridge2/posx.jpg",
      "https://threejs.org/examples/textures/cube/Bridge2/negx.jpg",
      "https://threejs.org/examples/textures/cube/Bridge2/posy.jpg",
      "https://threejs.org/examples/textures/cube/Bridge2/negy.jpg",
      "https://threejs.org/examples/textures/cube/Bridge2/posz.jpg",
      "https://threejs.org/examples/textures/cube/Bridge2/negz.jpg",
    ]);
    this.scene.background = skyboxTexture;

    // Add lights with increased intensity
    const ambientLight = new THREE.AmbientLight(0x404040, 3); // Increase ambient light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(0, 1, 2); // Move light to better illuminate sabers
    this.scene.add(ambientLight, directionalLight);

    // Setup controls based on device
    if (!this.isMobile) {
      this.setupDesktopControls();
    } else {
      this.setupMobileControls();
    }

    // Setup VR controllers
    this.setupVRControllers();

    // Create 3D score display
    const loader = new FontLoader();
    loader.load("https://threejs.org/examples/fonts/helvetiker_regular.typeface.json", (font) => {
      // Create score display
      const textGeometry = new TextGeometry("Score: 0", {
        font: font,
        size: 0.15,
        depth: 0.02,
      });
      const textMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1,
        metalness: 0,
        roughness: 0,
      });
      this.scoreText3D = new THREE.Mesh(textGeometry, textMaterial);
      this.scoreText3D.position.set(-1.5, 2.2, -2);
      this.scene.add(this.scoreText3D);

      // Create controls help
      this.createControlsHelp(font);
    });

    // Start animation loop
    this.renderer.setAnimationLoop(() => this.animate());

    // Handle window resize
    window.addEventListener("resize", () => this.onWindowResize());
  }

  setupVRControllers() {
    const controllerModelFactory = new XRControllerModelFactory();

    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.addEventListener("connected", (event) => {
        // Hide desktop sabers when VR session starts
        this.desktopSabers.forEach((saber) => {
          saber.visible = false;
        });

        // Remove help text immediately when entering VR
        if (this.helpText3D) {
          this.scene.remove(this.helpText3D);
          this.helpText3D.geometry.dispose();
          this.helpText3D.material.dispose();
          this.helpText3D = null;
        }

        const saber = this.createSaber(event.data.handedness === "left" ? "red" : "blue", true);
        controller.add(saber);
        this.vrSabers.push(saber);
      });

      controller.addEventListener("disconnected", () => {
        const saber = controller.children.find((child) => child.isSaber);
        if (saber) {
          controller.remove(saber);
          const index = this.vrSabers.indexOf(saber);
          if (index > -1) {
            this.vrSabers.splice(index, 1);
          }
          const saberIndex = this.sabers.indexOf(saber);
          if (saberIndex > -1) {
            this.sabers.splice(saberIndex, 1);
          }
        }
      });

      this.scene.add(controller);
      this.controllers.push(controller);

      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(controllerModelFactory.createControllerModel(grip));
      this.scene.add(grip);
    }

    // Listen for VR session end
    this.renderer.xr.addEventListener("sessionend", () => {
      // Clear VR sabers
      this.vrSabers.forEach((saber) => {
        const index = this.sabers.indexOf(saber);
        if (index > -1) {
          this.sabers.splice(index, 1);
        }
      });
      this.vrSabers = [];

      // Show desktop sabers again
      this.desktopSabers.forEach((saber) => {
        saber.visible = true;
      });
    });
  }

  setupDesktopControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 1.6, -2);

    // Create desktop sabers only if they don't exist
    if (this.desktopSabers.length === 0) {
      this.leftSaber = this.createSaber("red", false);
      this.rightSaber = this.createSaber("blue", false);
      this.scene.add(this.leftSaber, this.rightSaber);
      this.desktopSabers.push(this.leftSaber, this.rightSaber);

      // Position sabers in front of camera, slightly lower for better visibility
      this.leftSaber.position.set(-0.3, 1.0, 2);
      this.rightSaber.position.set(0.3, 1.0, 2);
    }

    // Add keyboard controls
    window.addEventListener("keydown", (event) => this.handleKeyboardInput(event));
  }

  setupMobileControls() {
    this.renderer.domElement.addEventListener("touchstart", (event) => this.handleTouchInput(event));
    this.renderer.domElement.addEventListener("touchmove", (event) => this.handleTouchInput(event));
  }

  createSaber(color, isVR = false) {
    const saberGroup = new THREE.Group();
    saberGroup.isSaber = true;

    // Create handle
    const handleGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 32);
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.8,
      roughness: 0.2,
    });
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);

    // Create blade with larger dimensions for better visibility
    const bladeGeometry = new THREE.CylinderGeometry(0.015, 0.015, 1.2, 32);
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: color === "red" ? 0xff0000 : 0x0000ff,
      emissive: color === "red" ? 0xff0000 : 0x0000ff,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.8,
    });
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);

    if (isVR) {
      // VR mode alignment
      handle.rotation.x = -Math.PI / 2;
      blade.position.z = -0.6;
      blade.rotation.x = -Math.PI / 2;
    } else {
      // Desktop mode alignment - point straight up
      blade.position.y = 0.6;
      // Remove the tilt rotations to keep sabers straight
      saberGroup.rotation.x = 0;
      saberGroup.rotation.z = 0;
    }

    saberGroup.add(handle, blade);
    this.sabers.push(saberGroup);
    return saberGroup;
  }

  handleKeyboardInput(event) {
    const MOVEMENT_SPEED = 0.1;
    const ROTATION_SPEED = 0.1;

    // Left Saber Controls (WASD + QE)
    if (this.leftSaber) {
      switch (event.key.toLowerCase()) {
        case "w":
          this.leftSaber.position.y += MOVEMENT_SPEED;
          break;
        case "s":
          this.leftSaber.position.y -= MOVEMENT_SPEED;
          break;
        case "a":
          this.leftSaber.position.x -= MOVEMENT_SPEED;
          break;
        case "d":
          this.leftSaber.position.x += MOVEMENT_SPEED;
          break;
        case "q":
          this.leftSaber.rotation.z += ROTATION_SPEED;
          break;
        case "e":
          this.leftSaber.rotation.z -= ROTATION_SPEED;
          break;
      }
    }

    // Right Saber Controls (Arrow Keys + []/)
    if (this.rightSaber) {
      switch (event.key) {
        case "ArrowUp":
          this.rightSaber.position.y += MOVEMENT_SPEED;
          break;
        case "ArrowDown":
          this.rightSaber.position.y -= MOVEMENT_SPEED;
          break;
        case "ArrowLeft":
          this.rightSaber.position.x -= MOVEMENT_SPEED;
          break;
        case "ArrowRight":
          this.rightSaber.position.x += MOVEMENT_SPEED;
          break;
        case "[":
          this.rightSaber.rotation.z += ROTATION_SPEED;
          break;
        case "]":
          this.rightSaber.rotation.z -= ROTATION_SPEED;
          break;
      }
    }

    // Reset positions with R key
    if (event.key.toLowerCase() === "r") {
      if (this.leftSaber) {
        this.leftSaber.position.set(-0.5, 0, -1);
        this.leftSaber.rotation.set(0, 0, 0);
      }
      if (this.rightSaber) {
        this.rightSaber.position.set(0.5, 0, -1);
        this.rightSaber.rotation.set(0, 0, 0);
      }
    }
  }

  handleTouchInput(event) {
    event.preventDefault();
    // Add touch-based control logic
  }

  spawnBlock() {
    const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const material = new THREE.MeshStandardMaterial({
      color: Math.random() > 0.5 ? 0xff0000 : 0x0000ff,
    });
    const block = new THREE.Mesh(geometry, material);

    block.position.set((Math.random() - 0.5) * 4, Math.random() * 2 + 1, -10);

    this.blocks.push(block);
    this.scene.add(block);
  }

  updateBlocks() {
    const speed = 0.05;
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const block = this.blocks[i];
      block.position.z += speed;

      // If block passes player without being hit
      if (block.position.z > 4) {
        // Add "miss" animation
        const direction = new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.1, 0.2);
        const rotationSpeed = new THREE.Vector3(Math.random() * 0.2 - 0.1, Math.random() * 0.2 - 0.1, Math.random() * 0.2 - 0.1);

        const animate = () => {
          if (block.position.z > 12) {
            this.scene.remove(block);
            return;
          }

          block.position.add(direction);
          direction.y -= 0.006;

          block.rotation.x += rotationSpeed.x;
          block.rotation.y += rotationSpeed.y;
          block.rotation.z += rotationSpeed.z;

          // Use setTimeout for VR, requestAnimationFrame for desktop
          if (this.renderer.xr.isPresenting) {
            setTimeout(() => animate(), 16);
          } else {
            requestAnimationFrame(animate);
          }
        };

        animate();
        this.blocks.splice(i, 1);
      }
    }

    if (Math.random() < 0.02) {
      this.spawnBlock();
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    const delta = this.clock.getDelta();

    if (this.controls) {
      this.controls.update();
    }

    // Update text positions in VR
    if (this.renderer.xr.isPresenting) {
      // Get camera position and direction
      const cameraPosition = new THREE.Vector3();
      const cameraDirection = new THREE.Vector3();

      // Get the XR camera
      const xrCamera = this.renderer.xr.getCamera();
      xrCamera.getWorldPosition(cameraPosition);
      xrCamera.getWorldDirection(cameraDirection);

      // Position score text
      if (this.scoreText3D) {
        // Position score text 2 meters in front, further left
        const scorePos = cameraPosition
          .clone()
          .add(cameraDirection.clone().multiplyScalar(2)) // 2 meters in front
          .add(new THREE.Vector3(-1.0, 0.3, 0)); // Increased left offset
        this.scoreText3D.position.copy(scorePos);
        this.scoreText3D.quaternion.copy(xrCamera.quaternion); // Match camera rotation
      }

      // Position help text
      if (this.helpText3D) {
        // Position help text 2 meters in front, further right
        const helpPos = cameraPosition
          .clone()
          .add(cameraDirection.clone().multiplyScalar(2)) // 2 meters in front
          .add(new THREE.Vector3(1.0, 0.3, 0)); // Increased right offset
        this.helpText3D.position.copy(helpPos);
        this.helpText3D.quaternion.copy(xrCamera.quaternion); // Match camera rotation
      }
    } else {
      // Desktop mode text updates
      if (this.scoreText3D) {
        this.scoreText3D.lookAt(this.camera.position);
      }
      if (this.helpText3D) {
        this.helpText3D.lookAt(this.camera.position);
      }
    }

    this.updateBlocks();
    this.checkCollisions();

    this.renderer.render(this.scene, this.camera);
  }

  updateScore(amount) {
    this.score += amount;

    if (this.scoreText3D) {
      const loader = new FontLoader();
      loader.load("https://threejs.org/examples/fonts/helvetiker_regular.typeface.json", (font) => {
        const newGeometry = new TextGeometry(`Score: ${this.score}`, {
          font: font,
          size: 0.15,
          depth: 0.02,
        });

        this.scoreText3D.geometry.dispose();
        this.scoreText3D.geometry = newGeometry;
      });
    }
  }

  checkCollisions() {
    this.sabers.forEach((saber) => {
      saber.updateMatrixWorld();
      const currentMatrix = saber.matrixWorld.clone();
      const previousMatrix = saber.userData.previousMatrix || currentMatrix.clone();
      saber.userData.previousMatrix = currentMatrix.clone();

      const blade = saber.children[1];
      const saberColor = blade.material.color.getHex();

      // Define blade points based on VR or desktop mode
      const isVR = this.renderer.xr.isPresenting;
      const localPoints = isVR
        ? [
            // VR mode: Points along Z-axis due to blade rotation
            new THREE.Vector3(0, 0, 0), // Base
            new THREE.Vector3(0, 0, -0.3), // Lower middle
            new THREE.Vector3(0, 0, -0.6), // Upper middle
            new THREE.Vector3(0, 0, -0.9), // Tip
          ]
        : [
            // Desktop mode: Points along Y-axis
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0.4, 0),
            new THREE.Vector3(0, 0.8, 0),
            new THREE.Vector3(0, 1.2, 0),
          ];

      // Transform points to world space
      const currentPoints = localPoints.map((p) => p.clone().applyMatrix4(currentMatrix));
      const previousPoints = localPoints.map((p) => p.clone().applyMatrix4(previousMatrix));

      // Check collisions with blocks
      for (let i = this.blocks.length - 1; i >= 0; i--) {
        const block = this.blocks[i];
        const blockColor = block.material.color.getHex();
        const blockBox = new THREE.Box3().setFromObject(block);

        let hasCollision = false;
        let collisionPoint = new THREE.Vector3();

        // Check each segment of the blade
        for (let j = 0; j < currentPoints.length - 1; j++) {
          // Create a swept area between previous and current positions
          const currentStart = currentPoints[j];
          const currentEnd = currentPoints[j + 1];
          const previousStart = previousPoints[j];
          const previousEnd = previousPoints[j + 1];

          // Check if any point of this swept area intersects with the block
          if (this.checkSweptLineBox(previousStart, previousEnd, currentStart, currentEnd, blockBox, collisionPoint)) {
            hasCollision = true;
            break;
          }
        }

        if (hasCollision) {
          // Remove the block
          this.scene.remove(block);
          this.blocks.splice(i, 1);

          // Calculate swing direction for particles
          const swingDirection = new THREE.Vector3().subVectors(currentPoints[3], previousPoints[3]).normalize();

          // Update score and create hit effect
          if (blockColor === saberColor) {
            this.updateScore(1);
            const effectPos = collisionPoint.clone().add(swingDirection.multiplyScalar(0.1));
            this.createHitEffect(effectPos, true);
          } else {
            this.updateScore(-1);
            const effectPos = collisionPoint.clone().add(swingDirection.multiplyScalar(0.1));
            this.createHitEffect(effectPos, false);
          }
        }
      }
    });
  }

  checkSweptLineBox(lineStart1, lineEnd1, lineStart2, lineEnd2, box, hitPoint) {
    // Create a triangle from the swept line
    const points = [lineStart1, lineEnd1, lineStart2, lineEnd2];

    // Check if any point is inside the box
    for (const point of points) {
      if (box.containsPoint(point)) {
        hitPoint.copy(point);
        return true;
      }
    }

    // Check line segments against box
    const segments = [
      [lineStart1, lineEnd1],
      [lineStart2, lineEnd2],
      [lineStart1, lineStart2],
      [lineEnd1, lineEnd2],
    ];

    for (const [start, end] of segments) {
      const direction = end.clone().sub(start).normalize();
      const ray = new THREE.Ray(start, direction);
      const distance = start.distanceTo(end);

      if (ray.intersectBox(box, hitPoint)) {
        if (hitPoint.distanceTo(start) <= distance) {
          return true;
        }
      }
    }

    return false;
  }

  createHitEffect(position, isMatch) {
    if (!position || !this.scene) return;

    const particleCount = 50; // Increased particle count
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const color = isMatch ? new THREE.Color(0x00ff00) : new THREE.Color(0xff0000);
    const spread = 0.5; // Increased spread

    // Create particles in a sphere
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = Math.random() * spread;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = position.x + x;
      positions[i * 3 + 1] = position.y + y;
      positions[i * 3 + 2] = position.z + z;

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.05, // Increased size
      vertexColors: true,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    // Store initial positions and create velocities
    const initialPositions = positions.slice();
    const velocities = new Float32Array(particleCount * 3);

    // Stronger velocities
    for (let i = 0; i < particleCount * 3; i++) {
      velocities[i] = (Math.random() - 0.5) * 0.1; // Increased velocity
    }

    let startTime = performance.now();
    const duration = 1000;

    const animate = () => {
      const currentTime = performance.now();
      const elapsed = currentTime - startTime;
      const progress = elapsed / duration;

      if (progress < 1 && particles && particles.geometry) {
        const currentPositions = particles.geometry.attributes.position.array;

        for (let i = 0; i < particleCount * 3; i++) {
          currentPositions[i] = initialPositions[i] + velocities[i] * elapsed * 0.05; // Increased movement speed
        }

        particles.geometry.attributes.position.needsUpdate = true;
        material.opacity = 1 - progress;

        if (this.renderer.xr.isPresenting) {
          setTimeout(() => animate(), 16);
        } else {
          requestAnimationFrame(animate);
        }
      } else if (particles) {
        if (this.scene) {
          this.scene.remove(particles);
        }
        if (geometry) {
          geometry.dispose();
        }
        if (material) {
          material.dispose();
        }
      }
    };

    animate();
  }

  createControlsHelp(font) {
    const helpText = [
      "Controls:",
      "",
      "Left Saber (Red):",
      "W/S: Up/Down",
      "A/D: Left/Right",
      "Q/E: Rotate",
      "",
      "Right Saber (Blue):",
      "↑/↓: Up/Down",
      "←/→: Left/Right",
      "[/]: Rotate",
      "",
      "R: Reset position",
    ].join("\n");

    const helpGeometry = new TextGeometry(helpText, {
      font: font,
      size: 0.08,
      depth: 0.01,
      height: 0.01,
    });

    const helpMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1,
      metalness: 0,
      roughness: 0,
    });

    this.helpText3D = new THREE.Mesh(helpGeometry, helpMaterial);
    this.helpText3D.position.set(1.5, 2.2, -2);
    this.scene.add(this.helpText3D);

    // Auto-hide controls after 10 seconds
    setTimeout(() => {
      if (this.helpText3D && this.renderer.xr.isPresenting) {
        const fadeOut = () => {
          if (this.helpText3D.material.opacity > 0) {
            this.helpText3D.material.opacity -= 0.01;
            requestAnimationFrame(fadeOut);
          } else {
            this.scene.remove(this.helpText3D);
            this.helpText3D.geometry.dispose();
            this.helpText3D.material.dispose();
            this.helpText3D = null;
          }
        };
        fadeOut();
      }
    }, 10000);
  }
}
