// Нарезка длинного скриншота на куски для ревью: модель видит страницу сверху вниз
// читаемым масштабом, а не одну уменьшенную картинку.
export type Tile = { y0: number; y1: number };

// Куски по высоте в пикселях PNG: шаг не меньше tileH, но кусков не больше maxTiles.
export function planTiles(pxHeight: number, maxTiles = 6, tileH = 1280): Tile[] {
	const h = Math.max(0, Math.round(pxHeight));
	if (h === 0) return [];
	const step = Math.max(tileH, Math.ceil(h / maxTiles));
	const tiles: Tile[] = [];
	for (let y0 = 0; y0 < h; y0 += step)
		tiles.push({ y0, y1: Math.min(h, y0 + step) });
	return tiles;
}

// Режет PNG (base64) на JPEG-куски через canvas iframe; возвращает base64 без префикса.
export function sliceImage(base64png: string, tiles: Tile[]): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const out: string[] = [];
			for (const t of tiles) {
				const h = t.y1 - t.y0;
				const canvas = document.createElement("canvas");
				canvas.width = img.naturalWidth;
				canvas.height = h;
				const ctx = canvas.getContext("2d");
				if (!ctx) return reject(new Error("canvas недоступен"));
				// JPEG без прозрачности: подкладываем белый фон.
				ctx.fillStyle = "#fff";
				ctx.fillRect(0, 0, canvas.width, h);
				ctx.drawImage(img, 0, t.y0, img.naturalWidth, h, 0, 0, canvas.width, h);
				out.push(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
			}
			resolve(out);
		};
		img.onerror = () => reject(new Error("не удалось прочитать PNG"));
		img.src = `data:image/png;base64,${base64png}`;
	});
}
