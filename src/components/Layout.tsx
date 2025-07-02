type LayoutProps = {
	children: any;
	title: string;
};

export const Layout = ({ children, title }: LayoutProps) => {
	return (
		<html lang="ja">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>{title}</title>
				<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
				<style>{`
					body {
						font-family: "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", "メイリオ", Meiryo, "ＭＳ Ｐゴシック", sans-serif;
						background-color: #f5f5f5;
					}
					.bookmeter-green {
						background-color: #77b944;
					}
					.bookmeter-green-text {
						color: #77b944;
					}
					.bookmeter-link {
						color: #77b944;
						text-decoration: none;
					}
					.bookmeter-link:hover {
						text-decoration: underline;
					}
				`}</style>
			</head>
			<body>
				<header class="bookmeter-green text-white py-4 shadow-md">
					<div class="container mx-auto px-4">
						<div class="flex items-center justify-between">
							<h1 class="text-xl font-bold">📚 読書メーター Plus</h1>
						</div>
					</div>
				</header>
				<main class="container mx-auto px-4 py-8">{children}</main>
			</body>
		</html>
	);
};
