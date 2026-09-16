import {test,expect} from 'bun:test';
import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {TwitterAccount} from '../web/components/twitter-account';
import {TwitterUpload} from '../web/components/twitter-upload';
import {TwitterTyping} from '../web/components/twitter-typing';
import {defaultContent} from '../core/content';
import {twitterPublicAccounts} from '../core/twitter-public';
import {I18nProvider} from '../web/lib/i18n';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const {createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server');

test('typing indicator names participants and has accessible animated dots',()=>{
 const html=renderToStaticMarkup(createElement(TwitterTyping,{label:'杏菜、檸檬 正在輸入…'}));expect(html).toContain('杏菜、檸檬');expect(html).toContain('role="status"');expect(html).toContain('tw-typing-dots');
 const css=readFileSync(new URL('../web/components/twitter.css',import.meta.url),'utf8');expect(css).toContain('@keyframes tw-typing-pulse');expect(css).toContain('prefers-reduced-motion');
});
test('pending upload renders an accessible animated placeholder rather than a published photo',()=>{
 const html=renderToStaticMarkup(createElement(TwitterUpload,{label:'圖片處理中，完成後發布…'}));expect(html).toContain('aria-busy="true"');expect(html).toContain('role="status"');expect(html).toContain('tw-upload-preview');expect(html).not.toContain('<img');
});

test('actual account component renders an online dot inside the avatar and hides it when offline',()=>{
 const props={character:defaultContent.characters.find(ch=>ch.id==='anna'),id:'anna',handle:'anna',isPrivate:false,onlineLabel:'在線',onVisit:()=>{}};
 const online=renderToStaticMarkup(createElement(I18nProvider,null,createElement(TwitterAccount,{...props,online:true}))),offline=renderToStaticMarkup(createElement(I18nProvider,null,createElement(TwitterAccount,{...props,online:false})));
 expect(online).toContain('class="tw-avatar-status"');expect(online).toContain('<i class="tw-online-dot" aria-label="在線" title="在線"></i></span>');
 expect(offline).not.toContain('tw-online-dot');expect(online).not.toContain('人在線');
 const css=readFileSync(new URL('../web/components/twitter.css',import.meta.url),'utf8');
 const wrapper=css.match(/\.tw-avatar-status\{([^}]+)\}/)![1],dot=css.match(/\.tw-online-dot\{([^}]+)\}/)![1];
 expect(wrapper).toContain('position:relative');expect(dot).toContain('position:absolute');expect(dot).toContain('right:-1px');expect(dot).toContain('top:-1px');expect(dot).not.toContain('bottom:');
});

test('player Twitter actions stay silent while pending and after ordinary success',()=>{
 const source=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');
 expect(source).not.toContain('正在透過 LLM 提交內容');
 expect(source).not.toContain('正在提交操作');
 expect(source).not.toContain('error||notice||busy');
 expect(source).toContain("{(error||notice)&&");
 expect(source).toContain("aria-busy={busyAction==='post'}");
 expect(source).toContain("busyAction==='post'?<LoaderCircle className=\"spin\"");
 expect(source).toContain("aria-busy={busyAction==='reply'}");
 expect(source).toContain("busyAction==='reply'?<LoaderCircle className=\"spin\"");
 expect(source).toContain('disabled={busy||state.ended||twitterPostPending(p)} onClick={()=>setDeletePost(p.id)}');
});

test('Twitter notifications use an unread dot and disappear individually after opening',()=>{
 const panel=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('../web/components/twitter.css',import.meta.url),'utf8'),server=readFileSync(new URL('../server/twitter.ts',import.meta.url),'utf8');
 expect(panel).toContain('tw-nav-notification-dot');expect(panel).toContain('markNotificationRead(token)');expect(panel).toContain('!notificationReadSet.has');expect(panel).toContain('IntersectionObserver');expect(panel).toContain('markPostSeen(p.id)');
 expect(panel).toContain('clearAllNotifications');expect(panel).toContain("translate('twitter.clearNotifications')");expect(panel).toContain('localStorage.setItem(notificationStorageKey,next)');expect(css).toContain('.tw-notification-tools{');
 expect(panel).not.toContain("translate('twitter.privateVisibility')");expect(server).not.toContain("notices['scheduler']");expect(css).toContain('.tw-nav-notification-dot{');
});
test('Twitter locks every composer while a post or reply is being submitted',()=>{
 const panel=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');
 expect(panel.match(/<textarea[^>]*disabled=\{busy\|\|state\.ended\}/g)?.length).toBe(3);
});
test('repost menu separates immediate repost from a text quote',()=>{
 const panel=readFileSync('web/components/twitter-panel.tsx','utf8'),css=readFileSync('web/components/twitter.css','utf8');
 expect(panel).toContain("translate('twitter.repostNow')");expect(panel).toContain("translate('twitter.quotePost')");expect(panel).toContain("act('quote',quoteTarget,quoteText)");expect(panel).toContain('p.quoteTo&&quoteCard(p.quoteTo)');expect(css).toContain('.tw-repost-menu');expect(css).toContain('.tw-quote-dialog');
});

test('social launchers share one badge design and show branded loading screens',()=>{
 const game=readFileSync(new URL('../web/components/game.tsx',import.meta.url),'utf8'),panel=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8'),globalCss=readFileSync(new URL('../web/app/globals.css',import.meta.url),'utf8');
 expect(game.match(/className="social-unread-dot"/g)?.length).toBe(2);expect(globalCss).toContain('.social-icon-wrap {');expect(globalCss).toContain('.social-unread-dot {');
 expect(panel).toContain('social-launch tw-launch');expect(panel).toMatch(/social-launch tw-launch[\s\S]*tw-app-close/);expect(game).toContain('social-launch line-launch');expect(game).toContain("t('game.openingLine')");
});

test('choices disappear immediately and Twitter supports private mentions, hashtags, search and trends',()=>{
 const game=readFileSync(new URL('../web/components/game.tsx',import.meta.url),'utf8'),panel=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8'),server=readFileSync(new URL('../server/twitter.ts',import.meta.url),'utf8');
 expect(game).toContain("!pendingChoice&&(locked && !morePages && !isTyping");expect(panel).not.toContain("filter(([,account])=>!account.private)");
 expect(panel).toContain('className="tw-hashtag"');expect(panel).toContain("translate('twitter.searchPlaceholder')");expect(panel).toContain('twitterTrends(t)');expect(server).toContain("prompt('twitter.hashtagSystem')");expect(server).toContain('trends:twitterTrends(view,actor)');
});

test('unfollowing an active account requires explicit confirmation',()=>{
 const source=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');
 expect(source).toContain("if(follows)setUnfollowTarget(id)");
 expect(source).toContain('open={!!unfollowTarget}');
 expect(source).toContain("act('unfollow',target)");
 expect(source).toContain("translate('twitter.unfollowConfirm')");
});

test('Twitter sidebar separates followed accounts from suggestions without duplicates',()=>{
 const source=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');
 expect(source).toContain('...officialAccounts.map(account=>account.id)');
 expect(source).toContain("id!==me&&t.following[me]?.[id]");
 expect(source).toContain('asideFollowing.map(id=><div key={id}>{account(id,true)}</div>)');
 expect(source).not.toMatch(/const asideFollowing=.*\.slice\(/);
 expect(source).toContain("ch.id!==me&&!t.following[me]?.[ch.id]");
 expect(source).toContain("translate('twitter.followingSection')");
 expect(source).toContain("translate('twitter.suggestionsSection')");
});

test('failed images can be retried and thread counts include nested replies with sorting controls',()=>{
 const source=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');
 expect(source).toContain("act('retry-image',post.id)");
 expect(source).toContain('comments=descendants(p.id)');
 expect(source).toContain("setReplySort('relevant')");
 expect(source).toContain("setReplySort('earliest')");
 expect(source).toContain("setReplySort('liked')");
});

test('only the rendered Twitter image is part of the external image link',()=>{
 const source=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../web/components/twitter.css',import.meta.url),'utf8');
 expect(source.match(/className="tw-photo-link"/g)?.length).toBe(2);
 expect(css).toContain('.tw-photo-link{display:block;width:fit-content;max-width:100%;line-height:0}');
});

test('official accounts render a verified badge and have their own account section',()=>{
 const html=renderToStaticMarkup(createElement(I18nProvider,null,createElement(TwitterAccount,{id:'official',name:'豊橋市役所',handle:'toyohashi_city',color:'#16836b',avatar:'/assets/twitter-official/toyohashi-city.jpg',isPrivate:false,verified:true,onlineLabel:'在線',onVisit:()=>{}})));
 expect(html).toContain('tw-verified');expect(html).toContain('認証済み');expect(html).toContain('豊橋市役所');expect(html).toContain('<img src="/assets/twitter-official/toyohashi-city.jpg"');expect(html).not.toContain('>豊</span>');
 for(const account of twitterPublicAccounts)expect(existsSync(new URL('../web/public'+account.avatar,import.meta.url))).toBe(true);
 const source=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');expect(source).toContain("translate('twitter.officialAccounts')");
});

test('player block UI explains destructive follow semantics and supports explicit unblock',()=>{
 const source=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');
 expect(source).toContain('open={!!blockTarget}');expect(source).toContain("act('block',target)");expect(source).toContain("void act('unblock',id)");
 expect(source).toContain("translate('twitter.blockDescription')");expect(source).toContain("translate('twitter.blockedByYou')");
});

test('profiles exclude replies and the Twitter modal hides its outer framing',()=>{
 const panel=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8'),game=readFileSync(new URL('../web/components/game.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('../web/components/twitter.css',import.meta.url),'utf8');
 expect(panel).toContain("tab==='profile'?!p.replyTo&&");
 expect(game).toContain("panel==='twitter'||panel==='phone'&&lineLaunching?'sr-only'");
 expect(css).toContain('.twitter-modal{padding:0!important');
});
test('Twitter uses an in-app close button instead of the outer dialog control',()=>{
 const panel=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8'),game=readFileSync(new URL('../web/components/game.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('../web/components/twitter.css',import.meta.url),'utf8'),globalCss=readFileSync(new URL('../web/app/globals.css',import.meta.url),'utf8');
 expect(game).toContain("showCloseButton={panel!=='twitter'");expect(game).toContain("onClose={()=>setPanel('')}");expect(panel.match(/className="tw-app-close"/g)).toHaveLength(2);expect(css).toContain('.twitter-modal .tw-app-close{position:absolute');expect(globalCss).toContain('.game-modal.twitter-modal {');expect(globalCss).toContain('width: min(1480px, calc(100vw - 8px)) !important');expect(globalCss).toContain('max-width: none !important');
});

test('NPC Twitter prompts expose optional contextual account mentions',()=>{
 const source=readFileSync(new URL('../server/twitter.ts',import.meta.url),'utf8');expect(source).toContain("prompt('twitter.mentionSystem')");
});
test('@all renders with the same blue mention treatment as account tags',()=>{
 const source=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');
 expect(source).toContain("broadcast=match[1]?.toLowerCase()==='all'");
 expect(source).toContain('<span className="tw-mention" key={match.index}><button type="button">{match[0]}</button></span>');
});

test('primary Twitter navigation resets the timeline to its newest position',()=>{
 const source=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');
 expect(source).toContain("scrollTo({top:0,behavior:'auto'})");
 expect(source).toContain('function switchTab(next:string)');
 expect(source).toContain('onClick={()=>switchTab(String(id))}');
 expect(source).toContain("function visit(id:string){setProfile(id);switchTab('profile');}");
});

test('keyboard mention navigation keeps the selected account visible inside its menu',()=>{
 const source=readFileSync(new URL('../web/components/twitter-panel.tsx',import.meta.url),'utf8');
 expect(source).toContain('function revealMentionSelection(input:HTMLTextAreaElement)');
 expect(source).toContain("querySelector<HTMLElement>('[aria-selected=\"true\"]')");
 expect(source).toContain('menu.scrollTop=bottom-menu.clientHeight');
 expect(source).toContain('revealMentionSelection(input)');
});
