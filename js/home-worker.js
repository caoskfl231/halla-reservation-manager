import { computeJob } from './home-compute.js?v=home-performance-20261010-1';
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id, result:computeJob(data.job)}); }
  catch (error) { self.postMessage({id:data.id,error:error.message}); }
};
