import { sanitizeContentText } from "./sanitizeContentText";

describe("sanitizeContentText", () => {
    describe("removes script vectors", () => {
        it.each([
            ["script tag", "<p>hi</p><script>alert(1)</script>", "<p>hi</p>"],
            ["inline event handler", '<p onclick="alert(1)">hi</p>', "<p>hi</p>"],
            ["img onerror", '<p>a</p><img src=x onerror="alert(1)">', "<p>a</p>"],
            ["javascript: link", '<a href="javascript:alert(1)">x</a>', "<a>x</a>"],
            [
                "obfuscated javascript: link",
                '<a href="jav&#x09;ascript:alert(1)">x</a>',
                "<a>x</a>",
            ],
            ["data: link", '<a href="data:text/html,<script>alert(1)</script>">x</a>', "<a>x</a>"],
            ["iframe", '<p>a</p><iframe src="https://evil.example"></iframe>', "<p>a</p>"],
            ["style tag", "<p>a</p><style>body{display:none}</style>", "<p>a</p>"],
            ["svg onload", '<svg onload="alert(1)"></svg><p>a</p>', "<p>a</p>"],
            ["style attribute", '<p style="position:fixed;inset:0">a</p>', "<p>a</p>"],
            [
                "arbitrary class",
                '<a class="fixed inset-0" href="https://a.example">x</a>',
                '<a href="https://a.example">x</a>',
            ],
            ["protocol-relative link", '<a href="//evil.example">x</a>', "<a>x</a>"],
        ])("%s", (_name, input, expected) => {
            expect(sanitizeContentText(input)).toBe(expected);
        });
    });

    it("forces a safe rel on links that open a new tab", () => {
        expect(
            sanitizeContentText('<a href="https://a.example" target="_blank" rel="opener">x</a>'),
        ).toBe(
            '<a href="https://a.example" target="_blank" rel="noopener noreferrer nofollow">x</a>',
        );
    });

    describe("leaves editor output unchanged", () => {
        it.each([
            [
                "paragraphs and inline marks",
                "<p>Hello <strong>bold</strong> <em>it</em> <u>u</u> <s>s</s> <code>c</code></p>",
            ],
            ["headings", "<h1>A</h1><h2>B</h2><h3>C</h3>"],
            ["lists", "<ul><li><p>a</p></li><li><p>b</p></li></ul><ol><li><p>1</p></li></ol>"],
            ["ordered list start", '<ol start="3"><li><p>x</p></li></ol>'],
            ["blockquote and rule", "<blockquote><p>q</p></blockquote><hr>"],
            ["hard break", "<p>a<br>b</p>"],
            ["code block", '<pre><code class="language-ts">const a = 1;</code></pre>'],
            [
                "safe links",
                '<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://a.example/x?y=1&amp;z=2">l</a> <a href="mailto:a@b.example">m</a> <a href="/relative/path">r</a></p>',
            ],
            ["escaped text", "<p>1 &lt; 2 &amp; 3 &gt; 2</p>"],
            ["non-breaking space", "<p>a&nbsp;b</p>"],
            ["empty paragraph", "<p></p>"],
        ])("%s", (_name, html) => {
            expect(sanitizeContentText(html)).toBe(html);
        });
    });

    it("is idempotent", () => {
        const dirty = '<p onclick="x">a<script>b</script></p><a href="javascript:1">c</a>';
        const once = sanitizeContentText(dirty);
        expect(sanitizeContentText(once)).toBe(once);
    });

    it("passes empty input through", () => {
        expect(sanitizeContentText("")).toBe("");
        expect(sanitizeContentText(undefined as unknown as string)).toBeUndefined();
    });
});
