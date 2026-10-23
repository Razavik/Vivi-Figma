// Мокапы устройств: рамка устройства + экран с обрезкой. Контент — клон
// существующего экрана (ref с масштабом под ширину экрана) или дети спеки.
const BEZEL = "#1C1C1E";

// Геометрия: outer — габариты, screen — внутренний прямоугольник и радиус.
export const DEVICES = {
	iphone: { w: 418, h: 872, radius: 62, screen: { x: 14, y: 14, w: 390, h: 844, radius: 48 } },
	android: { w: 380, h: 820, radius: 40, screen: { x: 10, y: 10, w: 360, h: 800, radius: 30 } },
	ipad: { w: 864, h: 1224, radius: 44, screen: { x: 22, y: 22, w: 820, h: 1180, radius: 24 } },
	macbook: { w: 1476, h: 940, radius: 24, screen: { x: 18, y: 22, w: 1440, h: 900, radius: 10 } },
	browser: { w: 1280, h: 840, radius: 12, screen: { x: 0, y: 40, w: 1280, h: 800, radius: 0 } },
	watch: { w: 234, h: 278, radius: 60, screen: { x: 18, y: 18, w: 198, h: 242, radius: 46 } },
};

export function deviceGeometry(device) {
	return DEVICES[device] || DEVICES.iphone;
}

function details(device, g) {
	const out = [];
	if (device === "iphone")
		out.push({ type: "frame", name: "Dynamic Island", position: "absolute", x: g.w / 2 - 60, y: 26, w: 120, h: 34, radius: 17, fill: "#000000" });
	if (device === "android")
		out.push({ type: "ellipse", name: "Camera", position: "absolute", x: g.w / 2 - 7, y: 24, w: 14, h: 14, fill: "#000000" });
	if (device === "watch")
		out.push({ type: "frame", name: "Crown", position: "absolute", x: g.w - 2, y: 70, w: 8, h: 40, radius: 3, fill: "#3A3A3C" });
	if (device === "browser") {
		out.push(
			{ type: "ellipse", name: "Close", x: 16, y: 14, w: 12, h: 12, fill: "#FF5F57" },
			{ type: "ellipse", name: "Minimize", x: 36, y: 14, w: 12, h: 12, fill: "#FEBC2E" },
			{ type: "ellipse", name: "Maximize", x: 56, y: 14, w: 12, h: 12, fill: "#28C840" },
			{ type: "frame", name: "Address bar", x: 96, y: 8, w: g.w - 192, h: 24, radius: 12, fill: "#E5E7EB" },
		);
	}
	return out;
}

export function expandMockup(spec) {
	const device = DEVICES[spec.device] ? spec.device : "iphone";
	const g = DEVICES[device];
	const isBrowser = device === "browser";
	const isMac = device === "macbook";

	const screenChildren = [];
	if (typeof spec.content === "string" && spec.content.trim()) {
		screenChildren.push({
			type: "ref",
			id: spec.content.trim(),
			name: "Screen snapshot",
			x: 0,
			y: 0,
			scaleToWidth: g.screen.w,
		});
	} else if (Array.isArray(spec.children) && spec.children.length) {
		screenChildren.push(...spec.children);
	}

	const children = [
		{
			type: "frame",
			name: "Body",
			x: 0,
			y: 0,
			w: g.w,
			h: g.h,
			radius: g.radius,
			fill: isBrowser ? "#F3F4F6" : BEZEL,
			...(isBrowser ? { stroke: "#D1D5DB", strokeWidth: 1 } : {}),
		},
		{
			type: "frame",
			name: "Screen",
			x: g.screen.x,
			y: g.screen.y,
			w: g.screen.w,
			h: g.screen.h,
			radius: g.screen.radius,
			clip: true,
			fill: "#FFFFFF",
			layout: "none",
			children: screenChildren,
		},
		...details(device, g),
	];
	let h = g.h;
	if (isMac) {
		children.push({
			type: "frame",
			name: "Base",
			x: -60,
			y: g.h - 2,
			w: g.w + 120,
			h: 18,
			radius: [0, 0, 12, 12],
			fill: "#C7C7CC",
		});
		h = g.h + 16;
	}
	const wrapper = {
		type: "frame",
		name: `Mockup / ${device}`,
		layout: "none",
		w: isMac ? g.w + 120 : g.w,
		h,
		x: spec.x,
		y: spec.y,
		position: spec.position,
		children,
	};
	// У macbook база выходит влево на 60 — сдвигаем всё внутрь рамки.
	if (isMac) for (const c of children) c.x = (c.x ?? 0) + 60;
	if (spec.shadow !== false) wrapper.children[0].shadow = { y: 24, blur: 48, color: "#00000040" };
	return wrapper;
}
