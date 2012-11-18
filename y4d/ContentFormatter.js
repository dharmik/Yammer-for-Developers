/* Yammer for Developers (y4d) v0.2.0
 * (C) 2012 Toru Nagashima <https://github.com/mysticatea>.
 */

/*global hljs*/
'use strict';

var ContentFormatter = {
  format: (function () {
    var rBR          = /<br> ?/g;
    var rLN          = /\n/g;
    var rOpenSign    = /<|\n```([^\n]*)\n|([\s\(\{\[<〈《［｛＜（、。])([`\*\/_\-])/g;
    var rCloseTag    = />/g;
    var rCloseInline = {
      '`': /[\n<]|`[\s\)\}\]>）＞｝］》〉、。]/g,
      '*': /[\n<]|\*[\s]/g,
      '/': /[\n<]|\/[\s]/g,
      '_': /[\n<]|_[\s]/g,
      '-': /[\n<]|\-[\s]/g,
    };
    var rCloseCodeBlock  = /\n```\n/g;
    var rCodeBlockWithLN = /<\/div>\n/g;
    var rReplaceChars    = /[　＠＃\t]|&(?:[lg]t|amp);|<[^>]+>/g;
    var rExcapeChars     = /[<>&]/g;
    var rSpanOpen        = /<span/g;
    var rSpanClose       = /<\/span/g;
    var rExpandLink      = /<a class="expand-body yj-small" href="javascript:\/\/">expand&nbsp;»<\/a><span class="remaining-body" style="display:none;">/;
    var rCollapseLink    = /<\/span>&nbsp;<a class="collapse-body yj-small" href="javascript:\/\/" style="display:none;">«&nbsp;collapse<\/a>/;

    var RCMap = {
      '　'   : ' ',
      '＠'   : '@',
      '＃'   : '#',
      '\t'   : '    ',
      '&lt;' : '<',
      '&gt;' : '>',
      '&amp;': '&'
    };
    var EscMap = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;'
    };

    var LangMap = [
      'python py',
      'ruby rb',
      'scala',
      'xml html htm',
      'markdown md',
      'css',
      'json',
      'javascript js',
      'coffeescript coffee',
      'java typescript ts', // is similar now.
      'cpp c++ c hpp h',
      'objectivec objective-c m',
      'cs c#',
      'sql',
      'diff',
      'dos bat cmd',
      'bash sh',
      'haskell hs'
    ].reduce(function (map, names_ssv) {
      var baseName = null;
      names_ssv.split(' ').forEach(function (name) {
        baseName  = baseName || name;
        map[name] = baseName;
      });
      return map;
    }, {});

    var match = function (pattern, i, content) {
      pattern.lastIndex = i;
      return pattern.exec(content);
    };

    var skipUntil = function (pattern, i, content) {
      pattern.lastIndex = i;
      return pattern.test(content) ? pattern.lastIndex : content.length;
    };

    var makePair = function (index, result) {
      return {index: index, result: result};
    };

    var count = function (pattern, text) {
      pattern.lastIndex = 0;

      var count = 0;
      while (pattern.test(text)) {
        ++count;
      }
      return count;
    };

    var highlight = function (code, lang) {
      // remove tags and replace special chars.
      code = code
        .replace(rReplaceChars, function (c) {
          var isTag = c.charAt(0) === '<';
          return isTag ? '' : RCMap[c];
        })
        .trim();
      lang = !lang ? null : LangMap[lang.toLowerCase()];

      try {
        // highlight.
        var highlighted =
          lang != null ? hljs.highlight(lang, code).value
          /* else */   : hljs.highlightAuto(code).value  ;

        // validation.
        var open  = count(rSpanOpen, highlighted);
        var close = count(rSpanClose, highlighted);
        if (open === close) {
          code = highlighted;
        }
        else {
          throw new Error('Invalid Highlight: open_tags=' + open + ', close_tags=' + close);
        }
      }
      catch (err) {
        console.warn('[y4d] Failed Syntax Highlight: ', err.message, '\n', code);

        // escape the code (because failed to escape in highlight)
        code = code.replace(rExcapeChars, function (c) { return EscMap[c]; });
      }

      return code;
    };

    var makeLineNumbers = function (code) {
      var result = '1';
      var number = 1;

      rLN.lastIndex = 0;
      while (rLN.test(code)) {
        result = result + '\n' + (++number);
      }
      return result;
    };

    var wrapTag = function (tag, kind, content, processContent) {
      // remove expand link.
      // the link append to next of this tag if found.
      var expandLink = '';
      rExpandLink.lastIndex = 0;
      content = content.replace(rExpandLink, function (whole) {
        expandLink = whole;
        return '';
      });

      // process the content and wrap tag.
      return '<' + tag + ' class="y4d-' + kind + '">' + processContent(content) + '</' + tag + '>' + expandLink;
    };

    var decoration = {
      '`': function (content) { return wrapTag('span', 'code',      content, highlight); },
      '*': function (content) { return wrapTag('span', 'bold',      content, ContentFormatter.format); },
      '/': function (content) { return wrapTag('span', 'italic',    content, ContentFormatter.format); },
      '_': function (content) { return wrapTag('span', 'underline', content, ContentFormatter.format); },
      '-': function (content) { return wrapTag('span', 'delete',    content, ContentFormatter.format); }
    };

    var processInlineElement = function (prespace, sign, i, content) {
      var rClose = rCloseInline[sign];
      var head   = i;
      var end    = content.length;

      while (i < end) {
        var m = match(rClose, i, content);
        if (m == null) {
          i = end;
        }
        else if (m[0] === '\n') {
          i = end = m.index;
        }
        else if (m[0] === '<') {
          // enter tag. skip until exit.
          i = skipUntil(rCloseTag, m.index, content);
        }
        else {
          // closer found.
          var inlineContent = content.slice(head, m.index);
          return makePair(m.index + 1, prespace + decoration[sign](inlineContent));
        }
      }

      // closer not found.
      return makePair(end, prespace + sign + content.slice(head, end));
    };

    var processCodeBlock = function (lang, i, content) {
      // slice `i` to the end of code-block.
      var m = match(rCloseCodeBlock, i, content);
      if (m == null) {
        // close sign not found.
        return makePair(i, '\n```' + lang + '\n');
      }

      // process code and wrap tag.
      return makePair(
        rCloseCodeBlock.lastIndex - 1,
        wrapTag(
          'div',
          'code',
          content.slice(i, m.index),
          function (code) {
            code        = highlight(code, lang);
            var numbers = makeLineNumbers(code);
            return '<table><tr><td>' + numbers + '</td><td>' + code + '</td></tr></table>';
          }
        )
      );
    };

    return function format (content) {
      // removes collapse link tag.
      // this link append to the reformatted text later.
      var collapseLink = '';
      content = content.replace(rCollapseLink, function (whole) {
        collapseLink = whole;
        return '';
      });

      // replaces <br> to \n to simplify searching lines.
      content = '\n' + content.replace(rBR, '\n') + '\n';

      var i      = 0;
      var head   = 0;
      var end    = content.length;
      var pair   = null;
      var result = '';

      rOpenSign.lastIndex = 0;
      while (i < end) {
        var m = match(rOpenSign, i, content);
        if (m != null) {
          i = rOpenSign.lastIndex;
          if (m[0] === '<') {
            // enter tag. skip until exit.
            i = skipUntil(rCloseTag, i, content);
            continue;
          }

          if (m[1] == null) {
            // found inline special element.
            pair = processInlineElement(m[2], m[3], i, content);
          }
          else {
            // found code block.
            pair = processCodeBlock(m[1], i, content);
          }
          result   = result + content.slice(head, m.index) + pair.result;
          i = head = pair.index;
        }
        else {
          // rearch the end.
          result   = result + content.slice(head);
          i = head = end;
        }
      }

      return result
        .trim()
        .replace(rCodeBlockWithLN, '</div>')
        .replace(rLN, '<br>')
        + collapseLink;
    };
  })(),

  replaceContent: function (dom) {
    var before = dom.innerHTML;
    var after  = ContentFormatter.format(before);
    if (after !== before) {
      dom.innerHTML = after;
    }
  }
};
