import { computeJob } from './home-compute.js?v=app-20261010-18';
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id, result:computeJob(data.job)}); }
  catch (error) { self.postMessage({id:data.id,error:error.message}); }
};
