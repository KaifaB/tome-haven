import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type Book3DProps = {
  title: string;
  author: string;
  isbn: string;
  coverUrl?: string;
  coverColor: string;
  accentColor: string;
};

export function getMostCommonCoverColor(pixels: Uint8ClampedArray): number | null {
  const colors = new Map<number, { count: number; red: number; green: number; blue: number }>();

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const bucket = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
    const color = colors.get(bucket) ?? { count: 0, red: 0, green: 0, blue: 0 };
    color.count += 1;
    color.red += red;
    color.green += green;
    color.blue += blue;
    colors.set(bucket, color);
  }

  const colorBuckets = Array.from(colors.values());
  if (colorBuckets.length === 0) return null;

  let mostCommon = colorBuckets[0];
  for (const color of colorBuckets.slice(1)) {
    if (color.count > mostCommon.count) mostCommon = color;
  }

  const red = Math.round(mostCommon.red / mostCommon.count);
  const green = Math.round(mostCommon.green / mostCommon.count);
  const blue = Math.round(mostCommon.blue / mostCommon.count);
  return (red << 16) | (green << 8) | blue;
}

function Book3D({ title, author, isbn, coverUrl, coverColor, accentColor }: Book3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglAvailable, setWebglAvailable] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    if (!window.WebGLRenderingContext && !window.WebGL2RenderingContext) {
      setWebglAvailable(false);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglAvailable(false);
      return;
    }

    setWebglAvailable(true);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(2.4, 1.45, 4.3);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffe6bd, 3.3);
    keyLight.position.set(-2, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xd8e8ed, 1.6);
    rimLight.position.set(3, 1, -3);
    scene.add(rimLight);

    const coverCanvas = document.createElement('canvas');
    coverCanvas.width = 512;
    coverCanvas.height = 768;
    const context = coverCanvas.getContext('2d');
    if (context) {
      context.fillStyle = coverColor;
      context.fillRect(0, 0, coverCanvas.width, coverCanvas.height);
      context.strokeStyle = accentColor;
      context.lineWidth = 3;
      context.strokeRect(24, 24, 464, 720);
      context.fillStyle = accentColor;
      context.globalAlpha = 0.23;
      context.beginPath();
      context.arc(256, 400, 150, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.textAlign = 'center';
      context.fillStyle = '#fff8e9';
      context.font = 'bold 43px Georgia, serif';
      const words = title.split(' ');
      const lines: string[] = [];
      let line = '';
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width > 410 && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });
      if (line) lines.push(line);
      const titleStart = 330 - (lines.length - 1) * 28;
      lines.forEach((titleLine, index) => {
        context.fillText(titleLine, 256, titleStart + index * 56, 410);
      });
      context.fillStyle = '#f1dfbf';
      context.font = '28px Georgia, serif';
      context.fillText(author.toUpperCase(), 256, 660, 410);
    }

    const coverTexture = new THREE.CanvasTexture(coverCanvas);
    coverTexture.colorSpace = THREE.SRGBColorSpace;
    const pageMaterial = new THREE.MeshStandardMaterial({ color: '#e8dcc5', roughness: 0.88 });
    const coverMaterial = new THREE.MeshStandardMaterial({ map: coverTexture, color: '#ffffff', roughness: 0.72 });
    const spineMaterial = new THREE.MeshStandardMaterial({ color: coverColor, roughness: 0.78 });
    let remoteCoverTexture: THREE.Texture | null = null;
    let isDisposed = false;
    const coverImageUrl = coverUrl || `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
    if (isbn || coverUrl) new THREE.TextureLoader().setCrossOrigin('anonymous').load(
      coverImageUrl,
      (texture) => {
        if (isDisposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        remoteCoverTexture = texture;
        coverMaterial.map = texture;
        coverMaterial.needsUpdate = true;
        coverTexture.dispose();
        try {
          const sampleCanvas = document.createElement('canvas');
          sampleCanvas.width = 48;
          sampleCanvas.height = 72;
          const sampleContext = sampleCanvas.getContext('2d');
          if (!sampleContext) return;
          sampleContext.drawImage(texture.image, 0, 0, sampleCanvas.width, sampleCanvas.height);
          const imageData = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
          const commonColor = getMostCommonCoverColor(imageData.data);
          if (commonColor !== null) {
            spineMaterial.color.setHex(commonColor);
          }
        } catch {
          // Keep the configured spine color if the remote image cannot be sampled.
        }
      },
      undefined,
      () => {
        // Keep the generated cover texture when Open Library has no image.
      },
    );
    const book = new THREE.Group();
    const pages = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, 1.42, 0.2),
      [pageMaterial, pageMaterial, pageMaterial, pageMaterial, pageMaterial, pageMaterial],
    );
    book.add(pages);
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(0.98, 1.46, 0.055),
      [spineMaterial, spineMaterial, spineMaterial, spineMaterial, coverMaterial, spineMaterial],
    );
    cover.position.set(0, 0, 0.12);
    book.add(cover);
    const backCover = new THREE.Mesh(
      new THREE.BoxGeometry(0.98, 1.46, 0.055),
      spineMaterial,
    );
    backCover.position.set(0, 0, -0.12);
    book.add(backCover);
    const spineWidth = 0.08;
    const spineDepth = 0.2;
    const coverLeftEdgeX = -0.49;
    const spinePositionX = coverLeftEdgeX + spineWidth / 2;
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(spineWidth, 1.46, spineDepth),
      spineMaterial,
    );
    spine.position.set(spinePositionX, 0, 0);
    book.add(spine);
    book.rotation.x = -0.06;
    scene.add(book);

    let targetRotationX = book.rotation.x;
    let targetRotationY = -0.34;
    let pointerDown = false;
    let previousPointerX = 0;
    let previousPointerY = 0;
    const canvas = renderer.domElement;
    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      pointerDown = true;
      previousPointerX = event.clientX;
      previousPointerY = event.clientY;
      mount.classList.add('book-render-dragging');
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerDown) return;
      targetRotationY += (event.clientX - previousPointerX) * 0.01;
      targetRotationX = THREE.MathUtils.clamp(
        targetRotationX + (event.clientY - previousPointerY) * 0.01,
        -1.1,
        1.1,
      );
      previousPointerX = event.clientX;
      previousPointerY = event.clientY;
    };
    const handlePointerUp = (event: PointerEvent) => {
      pointerDown = false;
      mount.classList.remove('book-render-dragging');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    let frameId = 0;
    const resizeObserver = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(mount);

    const renderFrame = (time: number) => {
      const idleRotation = pointerDown ? 0 : Math.sin(time * 0.00055) * 0.08;
      book.rotation.x += (targetRotationX - book.rotation.x) * 0.18;
      book.rotation.y += (targetRotationY + idleRotation - book.rotation.y) * 0.18;
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(renderFrame);
    };
    frameId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(frameId);
      isDisposed = true;
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      mount.classList.remove('book-render-dragging');
      resizeObserver.disconnect();
      pages.geometry.dispose();
      cover.geometry.dispose();
      backCover.geometry.dispose();
      spine.geometry.dispose();
      pageMaterial.dispose();
      coverMaterial.dispose();
      spineMaterial.dispose();
      coverTexture.dispose();
      remoteCoverTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [author, isbn, coverUrl, coverColor, accentColor, title]);

  return (
    <div className="book-render" ref={mountRef} aria-label={`3D cover of ${title}`}>
      {!webglAvailable && (
        <div className="book-render-fallback" style={{ backgroundColor: coverColor, borderColor: accentColor }}>
          <span>{title}</span>
          <small>{author}</small>
        </div>
      )}
    </div>
  );
}

export default Book3D;
