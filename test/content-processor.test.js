/**
 * Tests for ContentProcessor
 */

const ContentProcessor = require("../src/content-processor");

describe("ContentProcessor", () => {
  let processor;

  beforeEach(() => {
    processor = new ContentProcessor();
  });

  describe("processImageAlignment", () => {
    test("should center a paragraph that holds only an image", () => {
      const html = '<p><img src="a.png" alt="A"></p>';
      expect(processor.processImageAlignment(html)).toBe(
        '<p class="img-block"><img src="a.png" alt="A"></p>'
      );
    });

    test("should treat a linked image on its own as standalone", () => {
      const html = '<p><a href="x"><img src="a.png" alt="A"></a></p>';
      expect(processor.processImageAlignment(html)).toContain('<p class="img-block">');
    });

    test("should leave an image inside running text alone", () => {
      const html = '<p>Click <img src="icon.svg" alt="i"> to continue</p>';
      expect(processor.processImageAlignment(html)).toBe(html);
    });

    test("should apply an img-align override to the next standalone image only", () => {
      const html =
        '<!-- img-align: left -->\n<p><img src="a.png" alt="A"></p>\n<p><img src="a.png" alt="A"></p>';
      const result = processor.processImageAlignment(html);
      expect(result).toBe(
        '\n<p class="img-block img-align-left"><img src="a.png" alt="A"></p>\n' +
          '<p class="img-block"><img src="a.png" alt="A"></p>'
      );
    });

    test("should drop an img-align marker with no image after it", () => {
      const html = "<p>Text</p>\n<!-- img-align: right -->";
      expect(processor.processImageAlignment(html)).toBe("<p>Text</p>\n");
    });
  });
});
