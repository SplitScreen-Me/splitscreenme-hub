/** Format numbers with spaces*/
export default number => {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};
