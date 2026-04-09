import { renderToString } from "react-dom/server";

/**
 * Static landing page shell for prerendering.
 * Crawlers see this HTML; the React app hydrates over it on the client.
 */
function Landing() {
	return (
		<div className="min-h-screen bg-gray-950">
			<div className="mx-auto max-w-xl px-4 py-10">
				<div className="mb-8">
					<h1 className="mt-1 font-normal text-gray-400 text-sm">
						MyTrailPlan — Planificateur de ravitaillement et analyse GPX pour le
						trail running
					</h1>
				</div>
				<p className="text-gray-500 text-sm">
					Analyse la distribution des pentes de ta trace GPX, planifie ton
					ravitaillement et simule ton allure avec la VAP. Importe un fichier
					GPX pour commencer.
				</p>
			</div>
		</div>
	);
}

export async function prerender() {
	const html = renderToString(<Landing />);
	return { html };
}
