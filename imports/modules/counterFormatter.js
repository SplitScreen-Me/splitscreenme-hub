export default downloadCount => {
  if (downloadCount > 1000) {
    return (Math.floor(downloadCount / 100) / 10).toString() + 'K+';
  }
  return downloadCount;
};
