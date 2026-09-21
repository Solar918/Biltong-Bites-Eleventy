/**
 * Eleventy (11ty) Static Site Generator Configuration
 * ====================================================
 * Configures collections, asset passthrough, and directory paths for Biltong Bites.
 */

module.exports = function(eleventyConfig) {
  // 1. Static Asset Passthrough: Copy styles, scripts, and product images directly to `_site/assets`
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // 2. Products Collection: Read all markdown product specifications from `src/products/*.md`
  eleventyConfig.addCollection("products", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/products/*.md").sort((a, b) => {
      // Sort products by price ascending
      return (a.data.price || 0) - (b.data.price || 0);
    });
  });

  // 3. Flavour Tags: Extract unique set of flavours for filter dropdown
  eleventyConfig.addCollection("flavourTags", function(collectionApi) {
    const tagSet = new Set();
    collectionApi.getFilteredByGlob("src/products/*.md").forEach(item => {
      if (Array.isArray(item.data.flavour)) {
        item.data.flavour.forEach(f => tagSet.add(f));
      }
    });
    return Array.from(tagSet).sort();
  });

  // 4. Quantity Tags: Extract unique set of sizes/weights for filter dropdown
  eleventyConfig.addCollection("quantityTags", function(collectionApi) {
    const tagSet = new Set();
    collectionApi.getFilteredByGlob("src/products/*.md").forEach(item => {
      if (Array.isArray(item.data.quantity)) {
        item.data.quantity.forEach(q => tagSet.add(q));
      }
    });
    return Array.from(tagSet).sort();
  });

  // 5. Input / Output Directory Map
  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site"
    }
  };
};
