export default downloadCount => {
  return Math.abs(downloadCount) > 999999
    ? Math.floor(downloadCount / 100000) + 'm'
    : Math.abs(downloadCount) > 999
    ? Math.floor(downloadCount / 1000) + 'k'
    : downloadCount;
};
