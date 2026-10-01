import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	redirect(307, `/room/${encodeURIComponent(params.code.toUpperCase())}`);
};
