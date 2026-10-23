// Типы JSON-спецификации дизайна, которую возвращает модель.
// Схема задокументирована для модели в server/prompt.mjs — держать синхронно.

export type Size = number | "hug" | "fill";
export type Color = string; // "#RRGGBB" или "#RRGGBBAA"
/** Линейный градиент: угол в градусах как в CSS (180 — сверху вниз), 2+ цвета. */
export interface GradientFill {
	gradient: "linear";
	angle?: number;
	stops: Color[];
}

/** Радиальный: первый цвет в центре; center — доли ноды, radius — доля размера (0.5 — до краёв). */
export interface RadialFill {
	gradient: "radial";
	center?: [number, number];
	radius?: number;
	stops: Color[];
}

export type Fill =
	| Color
	| "none"
	| { color: Color; opacity?: number }
	| GradientFill
	| RadialFill;

export interface ShadowSpec {
	x?: number;
	y?: number;
	blur?: number;
	color?: Color;
}

export interface BaseSpec {
	type: string;
	/** id ноды Figma — присутствует в сериализованных нодах, которые
	 *  модель получает как контекст (для inspect/replace). */
	id?: string;
	name?: string;
	x?: number;
	y?: number;
	w?: Size;
	h?: Size;
	opacity?: number;
	/** "absolute" — внутри auto-layout нода выпадает из потока (бейдж поверх
	 *  фото): x/y от родителя, right/bottom — отступ от правого/нижнего края. */
	position?: "absolute" | "auto";
	right?: number;
	bottom?: number;
	/** Поворот в градусах по часовой, вокруг центра. */
	rotation?: number;
	/** Размытие самой ноды и фона под ней («стекло»), px. 0 — убрать. */
	layerBlur?: number;
	backgroundBlur?: number;
	/** Маска: нода обрезает все следующие за ней слои того же родителя (родитель — layout:"none"). */
	mask?: boolean;
	/** Исходник развёрнутого блока (chart/table) — пишется в pluginData. */
	meta?: Record<string, unknown>;
	/** Паттерн-заливка (плитка подставляется сервером из fill:{pattern}). */
	pattern?: { key: string; svg: string; side: number };
}

/** Обводка: стороны, положение и пунктир (у frame/rect/ellipse). */
export interface StrokeExtras {
	stroke?: Color | "none";
	strokeWidth?: number;
	/** Только эти стороны: "bottom" или ["top","bottom"]; "all" — все. */
	strokeSides?: StrokeSide | StrokeSide[];
	strokeAlign?: "inside" | "center" | "outside";
	/** Пунктир: [штрих, пробел], [] — сплошная. */
	dash?: number[];
}
export type StrokeSide = "top" | "right" | "bottom" | "left" | "all";

/** Кусок текста со своим стилем — текст ноды = склейка всех span.text. */
export interface TextSpan {
	text: string;
	fontWeight?: "regular" | "medium" | "semibold" | "bold";
	fontFamily?: string;
	fontSize?: number;
	color?: Color;
	textDecoration?: "underline" | "strike" | "none";
	/** URL ссылки на этом куске. */
	link?: string;
}

export interface FrameSpec extends BaseSpec, StrokeExtras {
	type: "frame";
	layout?: "none" | "vertical" | "horizontal";
	gap?: number;
	padding?: number | [number, number, number, number];
	align?: "start" | "center" | "end" | "space-between";
	cross?: "start" | "center" | "end";
	wrap?: boolean;
	/** Обрезать содержимое по границам фрейма. */
	clip?: boolean;
	/** Ограничения ширины в auto-layout (px). */
	minW?: number;
	maxW?: number;
	/** true — построить главный компонент вместо обычного фрейма. */
	component?: boolean;
	fill?: Fill;
	radius?: number | [number, number, number, number];
	shadow?: ShadowSpec;
	children?: DesignSpec[];
}

export interface TextSpec extends BaseSpec {
	type: "text";
	text: string;
	/** Разные стили внутри одного текста; при наличии text можно не задавать. */
	spans?: TextSpan[];
	fontSize?: number;
	fontWeight?: "regular" | "medium" | "semibold" | "bold";
	fontFamily?: string;
	/** Имя локального текстового стиля файла — шрифт/размер берутся из него. */
	textStyle?: string;
	color?: Color;
	align?: "left" | "center" | "right";
	lineHeight?: number;
	/** Разрядка: число — px, строка "2%" — проценты от кегля. */
	letterSpacing?: number | string;
	textCase?: "upper" | "lower" | "title" | "none";
	textDecoration?: "underline" | "strike" | "none";
	/** Не больше N строк, дальше многоточие (нужна фиксированная ширина или fill). */
	maxLines?: number;
	minW?: number;
	maxW?: number;
}

export interface RectSpec extends BaseSpec, StrokeExtras {
	type: "rect";
	fill?: Fill;
	radius?: number | [number, number, number, number];
}

export interface EllipseSpec extends BaseSpec, StrokeExtras {
	type: "ellipse";
	fill?: Fill;
}

export interface LineSpec extends BaseSpec {
	type: "line";
	direction?: "horizontal" | "vertical";
	stroke?: Color;
	strokeWidth?: number;
}

/** Векторная фигура: контур строится из вида (polygon/star/blob/wave/ring) или SVG-пути d. */
export interface ShapeSpec extends BaseSpec, StrokeExtras {
	type: "shape";
	shape?: "path" | "polygon" | "star" | "blob" | "wave" | "ring";
	/** SVG-контур (M L H V C S Q T A Z) в системе viewBox (по умолчанию w×h). */
	d?: string;
	viewBox?: [number, number];
	rule?: "nonzero" | "evenodd";
	sides?: number;
	points?: number;
	inner?: number;
	seed?: number | string;
	amplitude?: number;
	periods?: number;
	thickness?: number;
	fill?: Fill;
}

/** Булева операция над фигурами; x/y детей — от начала фигуры. */
export interface BoolSpec extends BaseSpec, StrokeExtras {
	type: "bool";
	op: "union" | "subtract" | "intersect" | "exclude";
	fill?: Fill;
	children: DesignSpec[];
}

export interface ImageSpec extends BaseSpec {
	type: "image";
	label?: string;
	/** Поисковый запрос для стокового фото — сервер подставляет data/mime. */
	query?: string;
	/** base64-байты картинки (заполняет сервер). */
	data?: string;
	mime?: string;
	radius?: number | [number, number, number, number];
	/** Вписывание фото: fill — заполнить с обрезкой (по умолчанию), fit — целиком. */
	fit?: "fill" | "fit";
	/** Слой поверх фото: цвет с альфой или градиент (затемнение под текст). */
	overlay?: Fill;
}

export interface IconSpec extends BaseSpec {
	type: "icon";
	/** Имя иконки Lucide (kebab-case) — сервер подставляет svg до отправки в плагин. */
	icon?: string;
	/** Валидная SVG-разметка иконки — строится через createNodeFromSvg. */
	svg?: string;
	color?: Color;
	strokeWidth?: number;
}

export interface InstanceSpec extends BaseSpec {
	type: "instance";
	/** id главного компонента (или набора вариантов). */
	component: string;
	/** {"<имя текстового слоя>": "новый текст"} */
	overrides?: Record<string, string>;
	/** Выбор варианта набора по свойствам: {"State":"Hover"}. */
	variants?: Record<string, string>;
}

export interface RefSpec extends BaseSpec {
	type: "ref";
	/** Масштабировать клон так, чтобы его ширина стала такой (px) — мокапы. */
	scaleToWidth?: number;
	/** id существующей ноды, которую нельзя описать спекой (вектор,
	 *  картинка) — при сборке клонируется как есть. */
	label?: string;
}

export type DesignSpec =
	| FrameSpec
	| TextSpec
	| RectSpec
	| EllipseSpec
	| LineSpec
	| ImageSpec
	| IconSpec
	| ShapeSpec
	| BoolSpec
	| RefSpec
	| InstanceSpec;
