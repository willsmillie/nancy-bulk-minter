require("console.mute");

// mute extraneous logs
async function muteBlock(callback) {
  console.mute();
  const res = await callback();
  console.resume();
  return res;
}

module.exports = {
  muteBlock,
};
