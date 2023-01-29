import { logger } from '../config/logger'
import { getBusinessEntityByCode } from '../lookup/service'
import { Notification } from '../model'

export async function createNotification (ticketId, email, mobileNo, notificationType, t) {
  try {
    logger.info('Creating notification')

    // Need to implement this template dynamically
    let notificationTemplate = `<table width="100%" cellspacing="0" cellpadding="0" border="0">
	<tr>
		<td valign="top" align="center">
			<table style="width="800">
				<tr>
					<td style="vertical-align:middle;">      
						<table width="800" cellspacing="0" cellpadding="0" border="0">
							<tbody>
								<tr>
									<td style="text-align:center; vertical-align:middle; height:50px;">
										<img src="https://aiosuat.comquest-brunei.com:10443/aios/static/media/Imagine.jpeg" width="280" height="80">
									</td>
								</tr>
								<tr>
									<td style="text-align:left; vertical-align:top;">
										<p style="font-family:Calibri,helvetica, arial, verdana, sans-serif; font-size:18px; color:#000000;">
											Dear Valued Customer,
										</p>
										
										<p style="font-family:Calibri,Helvetica,Regular, Arial; font-size:18px; color:#000000;"> Hello! Thank you for contacting imagine. For your reference, your ticket number is          
											<span style="color:#5042f4;">
												<b>${ticketId}</b>
											</span>. We will keep you posted within 5 days.        
										</p>										
										
									</td>
								</tr>							
								
								<tr>
									<td style="font-family:Calibri,Helvetica,Regular, Arial; font-size:18px; text-align:left; vertical-align:bottom;">
										<div class="">  
											Feel free to Talk2Us at 111 or simply Chat2Us at  <a href="https://imagine.com.bn/personal/support">https://imagine.com.bn/personal/support</a>.     
										</div>
									</td>
								</tr>
								<tr>
									<td style="text-align:left; vertical-align:top;">
										<p style="font-family:Calibri,Helvetica Regular, Arial; font-size:18px; color:#000000;">Yours sincerely,</p>
										<p style="font-family:Calibri,Helvetica Regular, Arial; font-size:18px; color:#000000;">Imagine</p>
									</td>
								</tr>								
								<tr>
									<td style="text-align:center; vertical-align:middle; height:50px;">
										<p style="padding:0px; margin:0px; font-family:Verdana, Helvetica Regular, Arial; font-size:11px; color:#000000; line-height:18px; ">This is an automatically generated email, Please do not reply.</p>
										<p style="padding:0px; margin:0px; font-family:Verdana, Helvetica Regular, Arial; font-size:11px; color:#000000; ">@ 2020 All Rights Reserved</p>
									</td>
								</tr>
								<tr>
									<td style="text-align:center;">
										<img src="https://aiosuat.comquest-brunei.com:10443/aios/static/media/EmailFooter.jpg" width="800" height="95">
									</td>
								</tr>
							</tbody>
						</table>
					</td>
				</tr>
			</table>
		</td>
	</tr>
</table>`
	  if (notificationType === 'SMS') {
		  notificationTemplate = `Hello! Your ticket ${ticketId}  has been created. Should you not hear from us within 5 days, kindly Talk2Us@111/Chat2Us@https://imagine.com.bn/personal/support`
	  }
    const notifaction = {
      email,
      mobileNo,
      subject: 'Your IMAGINE ticket has been created',
	  body: notificationTemplate,
	  referenceId: ticketId,
      notificationType
    }
    await Notification.create(notifaction)
    logger.debug('Notification created successfully')
  } catch (error) {
    logger.error(error, 'Error while creating Notification')
  }
}

export async function createUserNotification (ticketId, email, mobileNo, roleId, departmentId, userId, source, data, t, notificationSubject) {
  try {
    // yet to bring the table and all the contents
    const stDesc = await getBusinessEntityByCode(data.businessEntityCode)
    const statusDesc = await getBusinessEntityByCode(data.currStatus)
    const CONTENT = `<table style="border: 1px solid; width:80%"><thead><tr>
				<th style="border: 1px solid;">TICKET TYPE</th>				
				<th style="border: 1px solid;">ACCESS NUMBER</th>
				<th style="border: 1px solid;">SERVICE TYPE</th>
				<th style="border: 1px solid;">STATUS</th>
				<th style="border: 1px solid;">TICKET DESCRIPTION</th>
				</tr></thead>				
				<tbody><tr>
				<td style="border: 1px solid;">${source}</td>				
				<td style="border: 1px solid;">${data.identificationNo ? data.identificationNo : ''}</td>
				<td style="border: 1px solid;">${stDesc.description}</td>
				<td style="border: 1px solid;">${statusDesc.description}</td>
				<td style="border: 1px solid;">${data.description}</td>
				</tr></tbody>
				</table>`
    // console.log(data);
    // const CONTENT = data.description

    const notificationTemplate = `<table width="100%" cellspacing="0" cellpadding="0" border="0">
	<tr>
		<td valign="top" align="center">
			<table style="border:1px solid #0077CC;" width="800">
				<tr>
					<td style="padding:0px; margin:0px; background-color:#7cf5f9; vertical-align:middle;">      
						<table width="800" cellspacing="0" cellpadding="0" border="0">
							<tbody>
								<tr>
									<td style="padding:0px; margin:0px; background-color:#fdfefe; text-align:center; vertical-align:middle; height:50px;">
										<img src="https://aiosuat.comquest-brunei.com:10443/aios/static/media/Imagine.jpeg" width="280" height="80">
									</td>
								</tr>
								<tr>
									<td style="padding:5px 5px 0px 5px; margin:0px; background-color:#fdfefe; text-align:left; vertical-align:top;">
										<p style="font-family:Calibri,helvetica, arial, verdana, sans-serif; font-size:18px; color:#000000;">
											Dear Associate,
										</p>
									</td>
								</tr>
								<tr>
									<td style="padding:15px 5px 0px 5px; margin:0px; background-color:#fdfefe; text-align:left; vertical-align:top;">
										<p style="font-family:Calibri,Helvetica,Regular, Arial; font-size:18px; color:#000000;"> The ticket        
											<span style="color:#5042f4;">
												<b>${ticketId}</b>
											</span> has been ${notificationSubject} in Imagine AIOS system. Details are as below:      
										</p>
									</td>
								</tr>
								<tr>
									<td style="font-family:Calibri,Helvetica,Regular, Arial; font-size:18px;padding:15px 5px 0px 5px; margin:0px; background-color:#fdfefe; text-align:center; vertical-align:bottom;">
										<div class="mlTkt">  
											${CONTENT}   
										</div>
									</td>
								</tr>
								<tr>
									<td style="padding:15px 5px 0px 5px; margin:0px; background-color:#fdfefe; text-align:left; vertical-align:top;">
										<p style="font-family:Calibri,Helvetica Regular, Arial; font-size:18px; color:#000000;">Regards,</p>
									</td>
								</tr>
								<tr>
									<td style="padding:15px 5px 0px 5px; margin:0px; background-color:#fdfefe; text-align:left; vertical-align:top;">
										<p style="font-family:Calibri,Helvetica Regular, Arial; font-size:18px; color:#000000;">Imagine Team</p>
									</td>
								</tr>
								<tr>
									<td style="padding:10px 40px 0px 40px; margin:0px; background-color:#fdfefe; text-align:center; vertical-align:middle; height:50px;">
										<p style="padding:0px; margin:0px; font-family:Verdana, Helvetica Regular, Arial; font-size:11px; color:#000000; line-height:18px; ">This is an automatically generated email, Please do not reply.</p>
										<p style="padding:0px; margin:0px; font-family:Verdana, Helvetica Regular, Arial; font-size:11px; color:#000000; ">@ 2020 All Rights Reserved</p>
									</td>
								</tr>
									<tr>
									<td style="background-color:#fdfefe;text-align:center;">
										<img src="https://aiosuat.comquest-brunei.com:10443/aios/static/media/EmailFooter.jpg" width="800" height="95">
									</td>
								</tr>
							</tbody>
						</table>
					</td>
				</tr>
			</table>
		</td>
	</tr>
</table>`
    const nSubject = `Ticket ${ticketId} has been ${notificationSubject}`
    const notifaction = {
      email,
      mobileNo,
      subject: nSubject || 'Ticket has been assigned to your department',
      body: notificationTemplate,
      notificationType: 'Email',
	  referenceId: ticketId,
	  userId: userId || null,
      roleId,
      departmentId,
      source
    }
    await Notification.create(notifaction)
    logger.debug('Notification created successfully')
  } catch (error) {
    logger.error(error, 'Error while creating Notification')
  }
}

export async function createPopupNotification (ticketId, roleId, departmentId, userId, source, notificationSubject) {
  try {
	  const nSubject = `Ticket ${ticketId} has been ${notificationSubject}`
	  const notifaction = {
      email: null,
      mobileNo: null,
      subject: nSubject || 'Ticket has been assigned to your department',
      body: nSubject,
      notificationType: 'Popup',
      referenceId: ticketId,
      userId: userId || null,
      roleId,
      departmentId,
      source
	  }
	  await Notification.create(notifaction)
	  logger.debug('Popup Notification created successfully')
  } catch (error) {
	  logger.error(error, 'Error while creating Notification')
  }
}
