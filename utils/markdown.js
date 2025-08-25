export const convertMarkdownToHtml = (markdown) => {
  let html = markdown
    .replace(/^### (.*$)/gm, '<div class="section-title">$1</div>')
    .replace(/^## (.*$)/gm, '<div class="section-title">$1</div>')
    .replace(/^# (.*$)/gm, '<div class="main-title">$1</div>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\s*)+/gs, '<ul>$&</ul>')
    .replace(/--$/gm, '')
    .replace(/\*\*$/gm, '')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^\s*(.+)/gm, '<p>$1</p>')
    .replace(/<p><div/g, '<div')
    .replace(/<\/div><\/p>/g, '</div>')
    .replace(/<p><ul>/g, '<ul>')
    .replace(/<\/ul><\/p>/g, '</ul>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p><li>/g, '<li>')
    .replace(/<\/li><\/p>/g, '</li>');

  return html;
};


