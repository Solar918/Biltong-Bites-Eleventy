module.exports = function(eleventyConfig) {
  // Copy static assets (CSS, images) to output
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Collection of product markdown files for index rendering
  eleventyConfig.addCollection("products", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/products/*.md");
  });

  // Unique list of flavour tags from all products
  eleventyConfig.addCollection("flavourTags", function(collectionApi) {
    let tagSet = new Set();
    collectionApi.getFilteredByGlob("src/products/*.md").forEach(item => {
      if (Array.isArray(item.data.flavour)) {
        item.data.flavour.forEach(f => tagSet.add(f));
      }
    });
    return Array.from(tagSet).sort();
  });

  eleventyConfig.addCollection("quantityTags", function(collectionApi) {
    let tagSet = new Set();
    collectionApi.getFilteredByGlob("src/products/*.md").forEach(item => {
      if (Array.isArray(item.data.quantity)) {
        item.data.quantity.forEach(q => tagSet.add(q));
      }
    });
    return Array.from(tagSet).sort();
  });
  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site"
    }
  };
};
