const escapeRegExp = string => string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

export default escapeRegExp;