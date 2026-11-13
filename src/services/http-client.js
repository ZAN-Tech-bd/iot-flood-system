import axios from 'axios';
export const httpGet = (url, params) => axios.get(url, { params, timeout: 12_000 });
