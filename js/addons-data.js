export const addons = [
  {
    id: 'addon-1',
    title: 'Interactable Items',
    shortDescription: 'Run commands on item use',
    fullDescription: 'This addon allows you to create items that execute commands when used.<br><br>This lets you attach up to 10 commands and a cooldown to any item in the game (including from addons).<br><br>Once in game simply use the command /scriptevent edit:items<br><br>This will open a menu where you can add, edit, and remove the logic from any of your items.',
    downloadUrl: 'https://www.mediafire.com/file/qe97o1krggj0t66/Item_Editor.mcpack/file'
  },
  {
    id: 'addon-2',
    title: 'Plots',
    shortDescription: 'Quickly setup private plots with guest permissions',
    fullDescription: 'Notice<br>This addon is designed to be edited. Its usable in default settings but takes extra work.<br>-Setup/General Info<br>By default this addon requires all space +x 10,000 and further so try to build in negative x.  The tag staff will make you immune to plot permission checks. For setup run /scoreboard objectives add plot dummy<br>-Use<br>all interactions use the scriptevent command and should be paired with /execute.  Ex - /execute as @p run scriptevent plot:menu<br>-plot:menu<br>opens a quick options menu<br>-plot:reset<br>resets the players plot<br>-plot:claim<br>Gives the player their plot<br><br>(Advanced settings can be edited in the script.)',
    downloadUrl: 'https://www.mediafire.com/file/ma5m57e40g9hoyg/plots.mcpack/file'
  },
  {
    id: 'addon-3',
    title: 'More soon',
    shortDescription: 'Feel free to message me ideas',
    fullDescription: 'Ill be adapting more stuff that people keep asking me for just been busy',
    downloadUrl: '#'
  }
];
