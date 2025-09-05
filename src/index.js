import React from 'react';
import './index.css';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import axios from "axios";
axios.defaults.withCredentials = true;


// Force the browser fetch() to always include cookies too:
const _origFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  // do not override if caller already set it
  if (!init.credentials) init.credentials = "include";
  return _origFetch(input, init);
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
