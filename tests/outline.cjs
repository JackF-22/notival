const assert=require('node:assert/strict');const {detect,enclosing,withLeadingComments}=require('../extension/outline.js');
const flat=(nodes,depth=0)=>nodes.flatMap(n=>[`${'  '.repeat(depth)}${n.kind} ${n.name} ${n.start}-${n.end}`,...flat(n.children,depth+1)]);

const js=`import x from 'y';
/** Adds. */
export function add(a, b) {
  const s = "}";
  return a + b;
}

const double = (n) => {
  return n * 2;
};

const inc = n => n + 1;

class Cart extends Base {
  constructor(items) {
    super();
  }
  async total() {
    if (this.items) {
      return 1;
    }
    return 0;
  }
}
`;
assert.deepEqual(flat(detect(js,'javascript')),[
 'function add 2-5','function double 7-9','function inc 11-11','class Cart 13-23','  method constructor 14-16','  method total 17-22']);
assert.equal(withLeadingComments(js.split('\n'),2),1,'a doc comment above a function comes with it');

const py=`import os

@decorator
def top(a):
    return a

class Dog:
    def bark(self):
        print("woof")

    def sit(self):
        pass

def last():
    pass
`;
const p=flat(detect(py,'python'));
assert.deepEqual(p.map(s=>s.replace(/\d+-\d+/,'')),['function top ','class Dog ','  method bark ','  method sit ','function last '],'python: functions, classes and their methods');
assert.match(p[0],/top 3-4/);assert.match(p[1],/Dog 6-11/);

const swift=`import Foundation

protocol Speaker {
    func speak()
}

struct Dog: Speaker {
    var name: String
    func speak() {
        print("woof")
    }
}

extension Dog {
    mutating func rename(_ to: String) {
        name = to
    }
}

func main() {
    Dog(name: "a").speak()
}
`;
const sw=flat(detect(swift,'swift'));
assert.ok(sw.includes('struct Dog 6-11')&&sw.includes('  method speak 8-10')&&sw.includes('function main 19-21')&&sw.includes('  method rename 14-16'),'swift: '+sw.join(' | '));

const c=`#include <stdio.h>

static int square(int x) {
    return x * x;
}

int main(void)
{
    if (1) {
        printf("%d\\n", square(2));
    }
    return 0;
}
`;
assert.deepEqual(flat(detect(c,'c')),['function square 2-4','function main 6-12'],'c: functions, but not if statements');

const md=`# Title

Intro

## Setup

\`\`\`
# not a heading
\`\`\`

## Usage

### Flags

text
`;
const m=flat(detect(md,'markdown'));
assert.deepEqual(m.map(s=>s.replace(/\d+-\d+/,'')),['section Title ','  section Setup ','  section Usage ','    section Flags '],'markdown: headings nest');
assert.equal(detect('whatever','brainfuck').length,0,'an unknown language gives nothing rather than a guess');

const tree=detect(js,'javascript');
assert.equal(enclosing(tree,18).name,'total','the innermost block around a line');
assert.equal(enclosing(tree,0),null);
console.log('PASS: outline — functions, classes, methods and sections found in JavaScript, Python, Swift, C and Markdown.');
