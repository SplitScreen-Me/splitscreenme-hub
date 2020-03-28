const escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default escapeRegExp;