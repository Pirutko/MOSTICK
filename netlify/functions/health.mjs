export default async () => Response.json({ok:true, app:'MOSTIK', version:'5.1.8', backend:'netlify-functions'});
export const config = { path: '/api/health' };
