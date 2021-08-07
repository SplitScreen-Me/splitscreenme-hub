export default downloadCount => {
  return Math.abs(downloadCount) > 999500 ?
      Math.sign(downloadCount)*((Math.abs(downloadCount)/1000000).toFixed(0)) + 'm' :
      Math.abs(downloadCount) > 999 ?
          Math.sign(downloadCount)*((Math.abs(downloadCount)/1000).toFixed(0)) + 'k' :
          Math.sign(downloadCount)*Math.abs(downloadCount)
};