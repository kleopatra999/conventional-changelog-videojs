'use strict';
var compareFunc = require('compare-func');
var Q = require('q');
var readFile = Q.denodeify(require('fs').readFile);
var resolve = require('path').resolve;
var path = require('path');
var pkgJson = {};
var gufg = require('github-url-from-git');
try {
  pkgJson = require(path.resolve(
    process.cwd(),
    './package.json'
  ));
} catch (err) {
  console.error('no root package.json found');
}

var parserOpts = {
  headerPattern: /^(\w*)(?:\((.*)\))?\: (.*)$/,
  headerCorrespondence: [
    'type',
    'scope',
    'subject'
  ],
  noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES'],
  revertPattern: /^revert:\s([\s\S]*?)\s*This reverts commit (\w*)\./,
  revertCorrespondence: ['header', 'hash']
};

function issueUrl() {
  if (pkgJson.repository && pkgJson.repository.url && ~pkgJson.repository.url.indexOf('github.com')) {
    var gitUrl = gufg(pkgJson.repository.url);

    if (gitUrl) {
      return gitUrl + '/issues/';
    }
  }
}

var writerOpts = {
  transform: function(commit) {
    var discard = true;
    var issues = [];

    commit.notes.forEach(function(note) {
      note.title = 'BREAKING CHANGES';
      discard = false;
    });

    if (commit.type === 'feat') {
      commit.type = 'Features';
    } else if (commit.type === 'fix') {
      commit.type = 'Bug Fixes';
    } else if (commit.type === 'perf') {
      commit.type = 'Performance Improvements';
    } else if (commit.type === 'revert') {
      commit.type = 'Reverts';
    } else if (commit.type === 'docs') {
      commit.type = 'Documentation';
    } else if (commit.type === 'style') {
      commit.type = 'Styles';
    } else if (commit.type === 'refactor') {
      commit.type = 'Code Refactoring';
    } else if (commit.type === 'test') {
      commit.type = 'Tests';
    } else if (commit.type === 'chore') {
      commit.type = 'Chores';
    } else if (discard) {
      return;
    }

    if (commit.scope === '*') {
      commit.scope = '';
    }

    if (typeof commit.hash === 'string') {
      commit.hash = commit.hash.substring(0, 7);
    }

    if (typeof commit.subject === 'string') {
      var url = issueUrl();
      if (url) {
        // GitHub issue URLs.
        commit.subject = commit.subject.replace(/#([0-9]+)/g, function(_, issue) {
          issues.push(issue);
          return '[#' + issue + '](' + url + issue + ')';
        });
      }
      // GitHub user URLs.
      commit.subject = commit.subject.replace(/@([a-zA-Z0-9_]+)/g, '[@$1](https://github.com/$1)');
      commit.subject = commit.subject;
    }

    // remove references that already appear in the subject
    commit.references = commit.references.filter(function(reference) {
      if (issues.indexOf(reference.issue) === -1) {
        return true;
      }

      return false;
    });

    return commit;
  },
  groupBy: 'type',
  commitGroupsSort: function(group1, group2) {
    var priority = ['BREAKING CHANGES', 'Features', 'Bug Fixes'];

    for (var i = 0; i < priority.length; i++) {
      if (group1.title === priority[i]) {
        return -1;
      }
      if (group2.title === priority[i]) {
        return 1;
      }
    }

    if (group1.title < group2.title) {
      return -1;
    }
    if (group2.title < group1.title) {
      return 1;
    }
    return 0;
  },
  commitsSort: ['scope', 'subject'],
  noteGroupsSort: 'title',
  notesSort: compareFunc
};

module.exports = Q.all([
  readFile(resolve(__dirname, 'templates/template.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/header.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/commit.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/footer.hbs'), 'utf-8')
])
  .spread(function(template, header, commit, footer) {

    writerOpts.mainTemplate = template;
    writerOpts.headerPartial = header;
    writerOpts.commitPartial = commit;
    writerOpts.footerPartial = footer;

    return {
      parserOpts: parserOpts,
      writerOpts: writerOpts
    };
  });
