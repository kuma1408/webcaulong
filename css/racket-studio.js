(function () {
    'use strict';

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const studios = [];

    if (!window.THREE) {
        const fallback = () => document.querySelectorAll('[data-racket-studio]').forEach((root) => {
            root.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;padding:28px;text-align:center;color:#96a2b5;font:600 13px/1.7 system-ui">Không tải được thư viện 3D. Ảnh và thông tin sản phẩm vẫn hoạt động bình thường.</div>';
        });
        window.BadmintonRacketStudio = { studios, init: fallback, resize() {} };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fallback, { once: true });
        else fallback();
        return;
    }

    function showUnavailable(root, message) {
        root.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;padding:28px;text-align:center;color:#96a2b5;font:600 13px/1.7 system-ui">${message}</div>`;
    }

    function isWebGLAvailable() {
        try {
            const canvas = document.createElement('canvas');
            return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
        } catch (_) {
            return false;
        }
    }

    class EllipseCurve3 extends window.THREE.Curve {
        constructor(radiusX, radiusY, centerY) {
            super();
            this.radiusX = radiusX;
            this.radiusY = radiusY;
            this.centerY = centerY;
        }
        getPoint(t, target = new window.THREE.Vector3()) {
            const angle = t * Math.PI * 2;
            return target.set(
                Math.cos(angle) * this.radiusX,
                this.centerY + Math.sin(angle) * this.radiusY,
                0
            );
        }
    }

    class SpiralCurve3 extends window.THREE.Curve {
        getPoint(t, target = new window.THREE.Vector3()) {
            const turns = 8;
            const angle = t * Math.PI * 2 * turns;
            return target.set(Math.cos(angle) * .235, -2.03 - t * .95, Math.sin(angle) * .235);
        }
    }

    class RacketStudio {
        constructor(root) {
            this.root = root;
            this.active = true;
            this.dragging = false;
            this.lastX = 0;
            this.lastY = 0;
            this.lastPinch = 0;
            this.targetRotX = -.08;
            this.targetRotY = -.32;
            this.targetCameraZ = 7.2;
            this.exploded = false;
            this.macro = false;
            this.lastTime = performance.now();
            this.frame = 0;
            this.environment = 'cyber';
            this.parts = [];
            this.pulsing = [];
            this.frameMaterials = [];
            this.build();
        }

        build() {
            const THREE = window.THREE;
            this.root.classList.add('racket-studio');
            this.root.setAttribute('role', 'application');
            this.root.setAttribute('aria-label', 'Mô hình vợt cầu lông 3D tương tác');

            this.scene = new THREE.Scene();
            this.scene.fog = new THREE.FogExp2(0x080a0f, .045);
            this.camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
            this.camera.position.set(0, -.25, this.targetCameraZ);

            try {
                this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
            } catch (_) {
                showUnavailable(this.root, 'Thiết bị này chưa thể khởi tạo WebGL. Bạn vẫn có thể xem ảnh sản phẩm và mua hàng bình thường.');
                return;
            }
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(this.root.clientWidth || 600, this.root.clientHeight || 590, false);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            else if ('outputEncoding' in this.renderer && THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.18;
            this.root.prepend(this.renderer.domElement);

            this.ambient = new THREE.HemisphereLight(0xbfefff, 0x181021, 1.25);
            this.keyLight = new THREE.DirectionalLight(0xffffff, 2.25);
            this.keyLight.position.set(3.5, 5, 5);
            this.keyLight.castShadow = true;
            this.rimLight = new THREE.PointLight(0x00f0ff, 3, 18);
            this.rimLight.position.set(-3.2, 1.5, 3.2);
            this.warmLight = new THREE.PointLight(0xff5722, 2.3, 16);
            this.warmLight.position.set(3.5, -2.5, 2);
            this.scene.add(this.ambient, this.keyLight, this.rimLight, this.warmLight);

            this.model = new THREE.Group();
            this.model.rotation.x = this.targetRotX;
            this.model.rotation.y = this.targetRotY;
            this.scene.add(this.model);
            this.createRacket();
            this.createFloor();
            this.createHud();
            this.bindControls();
            this.applyEnvironment(this.root.dataset.preset || 'cyber');
            this.onResize();

            if (typeof ResizeObserver === 'function') {
                this.resizeObserver = new ResizeObserver(() => this.onResize());
                this.resizeObserver.observe(this.root);
            }
            if (typeof IntersectionObserver === 'function') {
                this.visibilityObserver = new IntersectionObserver((entries) => {
                    this.active = entries.some((entry) => entry.isIntersecting);
                }, { rootMargin: '200px' });
                this.visibilityObserver.observe(this.root);
            }
            this.animate(performance.now());
        }

        material(options) {
            return new window.THREE.MeshPhysicalMaterial({ roughness: .38, metalness: .5, clearcoat: .48, clearcoatRoughness: .3, ...options });
        }

        layer(name, explodeZ) {
            const group = new window.THREE.Group();
            group.name = name;
            group.userData.targetZ = 0;
            group.userData.explodeZ = explodeZ;
            this.parts.push(group);
            this.model.add(group);
            return group;
        }

        createRacket() {
            const THREE = window.THREE;
            const frameLayer = this.layer('Khung carbon', .22);
            const stringLayer = this.layer('Mặt lưới cước', 1.22);
            const grommetLayer = this.layer('Dải gen đệm', .82);
            const coreLayer = this.layer('Lõi giảm chấn', -.3);
            const jointLayer = this.layer('Khớp chữ T', -.62);
            const shaftLayer = this.layer('Đũa vợt', -.88);
            const gripLayer = this.layer('Cán cầm', -1.16);
            const capLayer = this.layer('Nắp chụp logo', -1.46);

            const carbon = this.material({ color: 0x1ce4f0, metalness: .72, roughness: .29 });
            const carbonEdge = this.material({ color: 0x07141a, metalness: .8, roughness: .34 });
            this.frameMaterials.push(carbon);
            const ellipse = new EllipseCurve3(.94, 1.2, 1.22);
            const frame = new THREE.Mesh(new THREE.TubeGeometry(ellipse, 144, .07, 12, true), carbon);
            frame.castShadow = true;
            frame.receiveShadow = true;
            frameLayer.add(frame);

            const insideFrame = new THREE.Mesh(new THREE.TubeGeometry(ellipse, 144, .024, 8, true), carbonEdge);
            insideFrame.scale.set(.93, .94, 1);
            insideFrame.position.y = .015;
            frameLayer.add(insideFrame);

            const stringMaterial = new THREE.LineBasicMaterial({ color: 0xf4f8ff, transparent: true, opacity: .72 });
            const verticalPoints = [];
            for (let index = -12; index <= 12; index += 1) {
                const x = index * .066;
                const ratio = Math.max(0, 1 - (x * x) / (.84 * .84));
                const extent = 1.08 * Math.sqrt(ratio);
                verticalPoints.push(x, 1.22 - extent, .026, x, 1.22 + extent, .026);
            }
            const horizontalPoints = [];
            for (let index = -15; index <= 15; index += 1) {
                const y = index * .067;
                const ratio = Math.max(0, 1 - (y * y) / (1.08 * 1.08));
                const extent = .84 * Math.sqrt(ratio);
                horizontalPoints.push(-extent, 1.22 + y, .02, extent, 1.22 + y, .02);
            }
            const verticalGeometry = new THREE.BufferGeometry();
            verticalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verticalPoints, 3));
            const horizontalGeometry = new THREE.BufferGeometry();
            horizontalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(horizontalPoints, 3));
            stringLayer.add(new THREE.LineSegments(verticalGeometry, stringMaterial), new THREE.LineSegments(horizontalGeometry, stringMaterial));

            const stencilMaterial = new THREE.LineBasicMaterial({ color: 0xff5722, transparent: true, opacity: .9 });
            const stencilPoints = [
                -.25, 1.45, .04, 0, 1.12, .04, 0, 1.12, .04, .25, 1.45, .04,
                -.18, 1.34, .04, .18, 1.34, .04
            ];
            const stencilGeometry = new THREE.BufferGeometry();
            stencilGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stencilPoints, 3));
            stringLayer.add(new THREE.LineSegments(stencilGeometry, stencilMaterial));

            const grommetMaterial = this.material({ color: 0x101720, metalness: .18, roughness: .72 });
            const grommetGeometry = new THREE.SphereGeometry(.028, 6, 5);
            for (let index = 0; index < 76; index += 1) {
                const t = index / 76;
                const point = ellipse.getPoint(t);
                const grommet = new THREE.Mesh(grommetGeometry, grommetMaterial);
                grommet.position.set(point.x, point.y, .062);
                grommetLayer.add(grommet);
            }

            const coreMaterial = this.material({ color: 0xeaff00, emissive: 0x526000, emissiveIntensity: .2, metalness: .25 });
            // CylinderGeometry tương thích bản Three.js cục bộ r128; bo tròn bằng
            // hai nắp cầu để vẫn giữ đúng hình dáng khớp T mà không cần addon.
            const core = new THREE.Group();
            const coreBody = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .24, 12), coreMaterial);
            const coreCapGeometry = new THREE.SphereGeometry(.09, 12, 8);
            const coreCapTop = new THREE.Mesh(coreCapGeometry, coreMaterial);
            const coreCapBottom = new THREE.Mesh(coreCapGeometry, coreMaterial);
            coreCapTop.position.y = .12;
            coreCapBottom.position.y = -.12;
            core.add(coreBody, coreCapTop, coreCapBottom);
            core.position.y = -.1;
            coreLayer.add(core);

            const jointMaterial = this.material({ color: 0x303848, metalness: .82, roughness: .25 });
            const joint = new THREE.Mesh(new THREE.SphereGeometry(.145, 18, 12), jointMaterial);
            joint.scale.set(1.15, .88, .78);
            joint.position.y = -.03;
            joint.castShadow = true;
            jointLayer.add(joint);

            const shaftMaterial = this.material({ color: 0xb6c4d4, metalness: .86, roughness: .22 });
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.044, .052, 1.78, 16), shaftMaterial);
            shaft.position.y = -.98;
            shaft.castShadow = true;
            shaftLayer.add(shaft);
            const shaftStripe = new THREE.Mesh(new THREE.CylinderGeometry(.051, .051, .56, 16, 1, true), carbon);
            shaftStripe.position.y = -.46;
            shaftLayer.add(shaftStripe);

            const wood = this.material({ color: 0xa66c3c, metalness: 0, roughness: .82 });
            const woodCore = new THREE.Mesh(new THREE.CylinderGeometry(.19, .21, .96, 12), wood);
            woodCore.position.y = -2.25;
            gripLayer.add(woodCore);
            const gripMaterial = this.material({ color: 0x111722, metalness: .08, roughness: .82 });
            const grip = new THREE.Mesh(new THREE.CylinderGeometry(.24, .255, .98, 16), gripMaterial);
            grip.position.y = -2.25;
            grip.castShadow = true;
            gripLayer.add(grip);
            const spiral = new THREE.Mesh(new THREE.TubeGeometry(new SpiralCurve3(), 95, .018, 5, false), this.material({ color: 0x00f0ff, metalness: .18, roughness: .52 }));
            gripLayer.add(spiral);

            const capMaterial = this.material({ color: 0xff5722, emissive: 0x401000, emissiveIntensity: .12, metalness: .38, roughness: .3 });
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(.28, .25, .18, 16), capMaterial);
            cap.position.y = -2.82;
            cap.castShadow = true;
            capLayer.add(cap);
            const capLogo = new THREE.Mesh(new THREE.CircleGeometry(.135, 24), new THREE.MeshBasicMaterial({ color: 0xeaff00 }));
            capLogo.rotation.x = Math.PI / 2;
            capLogo.position.set(0, -2.916, 0);
            capLayer.add(capLogo);

            this.createLaserAnnotations();
            this.model.scale.setScalar(.88);
            this.model.position.y = .18;
        }

        createLaserAnnotations() {
            const THREE = window.THREE;
            const definitions = [
                [[.82, 1.78, .1], [1.65, 2.08, .35]],
                [[.04, -.85, .1], [-1.45, -.65, .3]],
                [[.15, -2.3, .1], [1.5, -2.1, .32]]
            ];
            definitions.forEach((points, index) => {
                const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
                const material = new THREE.LineBasicMaterial({ color: index === 1 ? 0xff5722 : 0x00f0ff, transparent: true, opacity: .48 });
                this.model.add(new THREE.Line(geometry, material));
                const anchor = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), new THREE.MeshBasicMaterial({ color: material.color }));
                anchor.position.fromArray(points[1]);
                this.model.add(anchor);
                this.pulsing.push({ anchor, material, offset: index * 1.4 });
            });
        }

        createFloor() {
            const THREE = window.THREE;
            const grid = new THREE.GridHelper(12, 24, 0x173f50, 0x10212b);
            grid.position.y = -3.25;
            grid.rotation.x = 0;
            grid.material.transparent = true;
            grid.material.opacity = .34;
            this.scene.add(grid);
            const glow = new THREE.Mesh(
                new THREE.CircleGeometry(1.65, 48),
                new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: .055, depthWrite: false })
            );
            glow.rotation.x = -Math.PI / 2;
            glow.position.y = -3.22;
            this.scene.add(glow);
        }

        createHud() {
            if (this.root.querySelector('.racket-studio__hud')) return;
            const hud = document.createElement('div');
            hud.className = 'racket-studio__hud';
            hud.innerHTML = '<span class="racket-studio__status"><i></i> WebGL · 60 FPS READY</span><span class="racket-studio__hint">Kéo để xoay · cuộn/chụm để zoom</span>';
            const labels = document.createElement('div');
            labels.className = 'racket-studio__labels';
            labels.innerHTML = '<span class="racket-label racket-label--frame"><strong>Carbon frame</strong><span>Khung khí động học</span></span><span class="racket-label racket-label--shaft"><strong>6.6 mm shaft</strong><span>Thân vợt siêu mảnh</span></span><span class="racket-label racket-label--grip"><strong>PU overgrip</strong><span>Gân quấn chống trượt</span></span>';
            const controls = document.createElement('div');
            controls.className = 'racket-studio__controls';
            controls.innerHTML = `
                <button type="button" data-studio-action="explode" aria-pressed="false">🧩 Bóc tách 3D</button>
                <button type="button" data-studio-action="macro" aria-pressed="false">🔍 Soi macro</button>
                <select data-studio-action="preset" aria-label="Môi trường hiển thị">
                    <option value="arena">Arena</option>
                    <option value="white">Pro White</option>
                    <option value="cyber" selected>Cyber Sport</option>
                    <option value="midnight">Midnight</option>
                </select>
                <span class="studio-colors" aria-label="Màu khung vợt">
                    <button class="studio-color" type="button" style="--swatch:#00f0ff" data-studio-color="00f0ff" aria-label="Xanh laser" aria-pressed="true"></button>
                    <button class="studio-color" type="button" style="--swatch:#ff5722" data-studio-color="ff5722" aria-label="Cam lửa" aria-pressed="false"></button>
                    <button class="studio-color" type="button" style="--swatch:#eaff00" data-studio-color="eaff00" aria-label="Vàng volt" aria-pressed="false"></button>
                    <button class="studio-color" type="button" style="--swatch:#a78bfa" data-studio-color="a78bfa" aria-label="Tím cyber" aria-pressed="false"></button>
                </span>
                <button type="button" data-studio-action="reset">🎯 Reset</button>`;
            this.root.append(hud, labels, controls);
        }

        bindControls() {
            const canvas = this.renderer.domElement;
            canvas.addEventListener('pointerdown', (event) => {
                this.dragging = true;
                this.lastX = event.clientX;
                this.lastY = event.clientY;
                canvas.setPointerCapture?.(event.pointerId);
            });
            canvas.addEventListener('pointermove', (event) => {
                if (!this.dragging) return;
                const dx = event.clientX - this.lastX;
                const dy = event.clientY - this.lastY;
                this.targetRotY += dx * .008;
                this.targetRotX = Math.max(-.65, Math.min(.55, this.targetRotX + dy * .005));
                this.lastX = event.clientX;
                this.lastY = event.clientY;
            });
            const endDrag = (event) => {
                this.dragging = false;
                canvas.releasePointerCapture?.(event.pointerId);
            };
            canvas.addEventListener('pointerup', endDrag);
            canvas.addEventListener('pointercancel', endDrag);
            canvas.addEventListener('wheel', (event) => {
                event.preventDefault();
                this.targetCameraZ = Math.max(4.3, Math.min(10, this.targetCameraZ + event.deltaY * .004));
            }, { passive: false });
            canvas.addEventListener('touchmove', (event) => {
                if (event.touches.length !== 2) return;
                const [first, second] = event.touches;
                const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
                if (this.lastPinch) this.targetCameraZ = Math.max(4.3, Math.min(10, this.targetCameraZ - (distance - this.lastPinch) * .012));
                this.lastPinch = distance;
            }, { passive: true });
            canvas.addEventListener('touchend', () => { this.lastPinch = 0; }, { passive: true });

            this.root.querySelector('[data-studio-action="explode"]')?.addEventListener('click', (event) => {
                this.exploded = !this.exploded;
                event.currentTarget.setAttribute('aria-pressed', String(this.exploded));
                this.root.classList.toggle('is-exploded', this.exploded);
                this.parts.forEach((part) => { part.userData.targetZ = this.exploded ? part.userData.explodeZ : 0; });
            });
            this.root.querySelector('[data-studio-action="macro"]')?.addEventListener('click', (event) => {
                this.macro = !this.macro;
                event.currentTarget.setAttribute('aria-pressed', String(this.macro));
                this.targetCameraZ = this.macro ? 4.45 : 7.2;
                this.camera.position.x = this.macro ? 1.1 : 0;
                this.camera.position.y = this.macro ? 1.28 : -.25;
                this.camera.rotation.z = this.macro ? -.12 : 0;
                this.targetRotX = this.macro ? -.18 : -.08;
                this.targetRotY = this.macro ? -.62 : -.32;
            });
            this.root.querySelector('[data-studio-action="preset"]')?.addEventListener('change', (event) => this.applyEnvironment(event.target.value));
            this.root.querySelectorAll('[data-studio-color]').forEach((button) => button.addEventListener('click', () => {
                this.root.querySelectorAll('[data-studio-color]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
                const color = Number.parseInt(button.dataset.studioColor, 16);
                this.frameMaterials.forEach((material) => material.color.setHex(color));
            }));
            this.root.querySelector('[data-studio-action="reset"]')?.addEventListener('click', () => this.reset());
            this.root.addEventListener('racketstudio:resize', () => this.onResize());
        }

        applyEnvironment(name) {
            this.environment = name;
            const schemes = {
                arena: { fog: 0x120b08, hemi: 0xffd8c8, ground: 0x25100a, rim: 0xff5722, warm: 0xffb06d, exposure: 1.12 },
                white: { fog: 0xe8eef6, hemi: 0xffffff, ground: 0xb9c6d6, rim: 0x71d8ff, warm: 0xffd0b0, exposure: 1.35 },
                cyber: { fog: 0x080a0f, hemi: 0xbfefff, ground: 0x181021, rim: 0x00f0ff, warm: 0xff5722, exposure: 1.18 },
                midnight: { fog: 0x02040a, hemi: 0x506b9b, ground: 0x05060c, rim: 0x745cff, warm: 0x00b5c4, exposure: .92 }
            };
            const scheme = schemes[name] || schemes.cyber;
            this.scene.fog.color.setHex(scheme.fog);
            this.ambient.color.setHex(scheme.hemi);
            this.ambient.groundColor.setHex(scheme.ground);
            this.rimLight.color.setHex(scheme.rim);
            this.warmLight.color.setHex(scheme.warm);
            this.renderer.toneMappingExposure = scheme.exposure;
            const backgrounds = {
                arena: 'radial-gradient(circle at 50% 36%, #342018, #0c0807 72%)',
                white: 'radial-gradient(circle at 50% 38%, #ffffff, #dbe4ef 76%)',
                cyber: 'radial-gradient(circle at 50% 42%, #182535, #080a0f 72%)',
                midnight: 'radial-gradient(circle at 50% 40%, #101429, #020308 74%)'
            };
            this.root.style.background = backgrounds[name] || backgrounds.cyber;
        }

        reset() {
            this.targetRotX = -.08;
            this.targetRotY = -.32;
            this.targetCameraZ = 7.2;
            this.camera.position.x = 0;
            this.camera.position.y = -.25;
            this.camera.rotation.z = 0;
            this.macro = false;
            this.exploded = false;
            this.parts.forEach((part) => { part.userData.targetZ = 0; });
            this.root.querySelectorAll('[data-studio-action="explode"], [data-studio-action="macro"]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
        }

        onResize() {
            if (!this.renderer || !this.root.isConnected) return;
            const width = Math.max(1, this.root.clientWidth);
            const height = Math.max(1, this.root.clientHeight);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height, false);
        }

        animate(now) {
            if (!this.renderer) return;
            const dt = Math.min(.05, Math.max(.001, (now - this.lastTime) / 1000));
            this.lastTime = now;
            if (this.active && !document.hidden) {
                const time = now / 1000;
                if (!this.dragging && !reducedMotion?.matches) this.targetRotY += dt * .17;
                const smoothFactor = 1 - Math.exp(-14 * dt);
                this.model.rotation.y += (this.targetRotY - this.model.rotation.y) * smoothFactor;
                this.model.rotation.x += (this.targetRotX - this.model.rotation.x) * smoothFactor;
                this.model.position.y = reducedMotion?.matches ? .18 : .18 + Math.sin(time * 1.6) * .07;
                this.camera.position.z += (this.targetCameraZ - this.camera.position.z) * (1 - Math.exp(-10 * dt));
                this.camera.lookAt(0, this.macro ? 1.15 : -.1, 0);
                this.parts.forEach((part) => {
                    part.position.z += (part.userData.targetZ - part.position.z) * (1 - Math.exp(-9 * dt));
                });
                this.pulsing.forEach((item) => {
                    const pulse = .65 + Math.sin(time * 6.0 + item.offset) * .3;
                    item.anchor.scale.setScalar(.78 + pulse * .38);
                    item.material.opacity = .24 + pulse * .42;
                });
                this.renderer.render(this.scene, this.camera);
            }
            this.frame = requestAnimationFrame((timestamp) => this.animate(timestamp));
        }
    }

    function initStudios(root = document) {
        root.querySelectorAll?.('[data-racket-studio]').forEach((element) => {
            if (element.dataset.studioReady === 'true') return;
            element.dataset.studioReady = 'true';
            const studio = new RacketStudio(element);
            if (studio.renderer) studios.push(studio);
        });
    }

    function resizeStudios(container = document) {
        studios.forEach((studio) => {
            if (container === document || container.contains(studio.root)) studio.onResize();
        });
    }

    function boot() {
        if (!window.THREE || !isWebGLAvailable()) {
            document.querySelectorAll('[data-racket-studio]').forEach((root) => showUnavailable(root, 'Trình duyệt chưa hỗ trợ mô hình 3D. Ảnh và thông tin sản phẩm vẫn hoạt động bình thường.'));
            return;
        }
        initStudios();
        document.querySelectorAll('[data-open-quick-3d]').forEach((button) => button.addEventListener('click', () => {
            const dialog = document.getElementById(button.dataset.openQuick3d || 'quick3dDialog');
            if (!dialog) return;
            dialog.showModal();
            [30, 150, 350].forEach((delay) => window.setTimeout(() => resizeStudios(dialog), delay));
        }));
        document.querySelectorAll('[data-close-quick-3d]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
        document.querySelectorAll('.quick-3d-dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close();
        }));
    }

    window.BadmintonRacketStudio = { studios, init: initStudios, resize: resizeStudios };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
}());
