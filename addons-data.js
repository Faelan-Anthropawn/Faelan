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
    title: 'Invisible Deny, Borders and Allow',
    shortDescription: 'Easily hide these ugly admin blocks from view',
    fullDescription: 'This is a resource pack which makes allow, deny, and border blocks (including their particles) completley invisible<br>-Due to limitations with resource packs holding the block will not show you their placed locations.<br>-This pack is recommended for use after building has been finished.',
    downloadUrl: 'https://www.mediafire.com/file/0nsxaeme45pyyko/Invisible_Borders_Deny_Allow.mcpack/file'
  },
  {
    id: 'addon-4',
    title: 'Player Data Controller',
    shortDescription: 'Edit PvP and health directly with commands',
    fullDescription: 'This will allow you to have better control over players.<br>-Teams - You can use the tags team1 through team5  Players with that have the same team tag cant hit each other.<br>-Anti spawn PvP - Give the tag spawn to stop all damage to the player including mobs, PvP, and any other damage.<br>-Health manipulation - controlled through the /event command allows you to set individual players health from 1 to 50 hearts. Ex - /event entity @s health20<br><br>WARNING - This addon uses player.json to edit these properties.  This means it may not be compatible with every addon.',
    downloadUrl: 'https://www.mediafire.com/file/ds0axbtgkq3xuzl/Player_Data_Controller.mcpack/file'
  },
  {
    id: 'addon-5',
    title: 'Uncraftable Boats',
    shortDescription: 'Removes the crafting recipe for boats and minecarts',
    fullDescription: 'This addon dosent fully remove boats or minecarts but it does remove their crafting. These buggy additions are frequently used to glitch out of maps, but can still be useful at times.<br>-No boats/minecarts are killed or cleared from the inventory<br>-All boats/minecarts are impossible to craft and removed from the list',
    downloadUrl: 'https://www.mediafire.com/file/gvz0snn2451y2x1/Uncraftable_Boats.mcpack/file'
  },
  {
    id: 'addon-6',
    title: 'Server Style PvP',
    shortDescription: 'Mimick the style of PvP on servers such as the Hive',
    fullDescription: 'This is a 3 part addon<br>-Knockback - This edits knockback to be slightly stronger and more floaty<br>-Bow dings - Hitting another player with a bow makes a ding sound effect<br>-Stats - Adds a means to track the kills and deaths of a player.  (scoreboards arent automatically added.  It uses the scores of "death" and "kills")',
    downloadUrl: 'https://www.mediafire.com/file/es7k9izdoimd6kn/Server_Style_PvP.mcpack/file'
  },
  {
    id: 'more soon',
    title: 'More soon',
    shortDescription: 'Feel free to message me ideas',
    fullDescription: 'Ill be adapting more stuff that people keep asking me for just been busy',
    downloadUrl: '#'
  }
];
