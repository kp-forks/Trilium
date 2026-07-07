import type Turnish from "turnish";

export default function taskListItems (turndownService: Turnish) {
  turndownService.addRule('taskListItems', {
    filter: function (node) {
      return (node as HTMLInputElement).type === 'checkbox' && node.parentNode?.nodeName === 'LI'
    },
    replacement: function (content: string, node) {
      return (node.checked ? '[x]' : '[ ]') + ' '
    }
  })
}
