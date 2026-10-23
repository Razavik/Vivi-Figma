// Палитра из изображения без модели: k-means по пикселям уменьшенной картинки.
// Чистая функция над массивом пикселей — проверяется тестами; чтение пикселей
// с canvas — в paletteFromDataUrl.
export type Rgb = [number, number, number];

const hex = (c: Rgb) =>
	"#" +
	c
		.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase();

const dist = (a: Rgb, b: Rgb) =>
	(a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// k-means с детерминированной инициализацией (самые далёкие друг от друга
// пиксели): результат стабилен между запусками. Цвета — по убыванию доли.
export function kmeans(pixels: Rgb[], k = 6, iterations = 12): { color: string; share: number }[] {
	if (!pixels.length) return [];
	const centers: Rgb[] = [pixels[0]];
	while (centers.length < Math.min(k, pixels.length)) {
		let best = pixels[0];
		let bestD = -1;
		for (const p of pixels) {
			const d = Math.min(...centers.map((c) => dist(c, p)));
			if (d > bestD) {
				bestD = d;
				best = p;
			}
		}
		if (bestD <= 0) break;
		centers.push(best);
	}
	let counts: number[] = [];
	for (let it = 0; it < iterations; it++) {
		const sums = centers.map(() => [0, 0, 0, 0]);
		for (const p of pixels) {
			let bi = 0;
			let bd = Infinity;
			centers.forEach((c, i) => {
				const d = dist(c, p);
				if (d < bd) {
					bd = d;
					bi = i;
				}
			});
			sums[bi][0] += p[0];
			sums[bi][1] += p[1];
			sums[bi][2] += p[2];
			sums[bi][3]++;
		}
		counts = sums.map((s) => s[3]);
		sums.forEach((s, i) => {
			if (s[3]) centers[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
		});
	}
	return centers
		.map((c, i) => ({ color: hex(c), share: counts[i] / pixels.length }))
		.filter((c) => c.share > 0)
		.sort((a, b) => b.share - a.share);
}

// Палитра нескольких изображений: общий k-means, без почти одинаковых цветов.
export function mergePalettes(lists: Rgb[][], k = 6): string[] {
	const all = lists.flat();
	const out: string[] = [];
	for (const { color } of kmeans(all, k + 2)) {
		if (out.length >= k) break;
		out.push(color);
	}
	return out;
}

// Пиксели картинки (data URL) через canvas 48×48; прозрачные пропускаем.
export async function pixelsFromDataUrl(dataUrl: string): Promise<Rgb[]> {
	const img = new Image();
	img.src = dataUrl;
	await img.decode();
	const side = 48;
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = side;
	const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
	ctx.drawImage(img, 0, 0, side, side);
	const data = ctx.getImageData(0, 0, side, side).data;
	const out: Rgb[] = [];
	for (let i = 0; i < data.length; i += 4)
		if (data[i + 3] > 200) out.push([data[i], data[i + 1], data[i + 2]]);
	return out;
}

// Цвета нескольких картинок вперемешку (по кругу), без повторов, не больше max.
export function mixColors(lists: string[][], max = 7): string[] {
	const out: string[] = [];
	for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++)
		for (const l of lists)
			if (i < l.length && !out.includes(l[i]) && out.length < max) out.push(l[i]);
	return out;
}
